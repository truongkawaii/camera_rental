const { v2: cloudinary } = require('cloudinary');
const sharp = require('sharp');
const { Readable } = require('stream');

const ALLOWED_IMAGE_ENTITIES = ['equipment', 'branches', 'customers', 'rentals', 'sale_transfers'];

// Map entity type to actual DB table name (for entities whose table name differs)
const ENTITY_TABLE_MAP = {
  sale_transfers: 'sales_transfer_logs',
};
const MAX_IMAGES_PER_ENTITY = Number(process.env.MAX_IMAGES_PER_ENTITY || 10);
const MAX_DATA_URI_LENGTH = Number(process.env.MAX_IMAGE_DATA_URI_LENGTH || 50 * 1024 * 1024);
const MAX_IMAGE_DIMENSION = Number(process.env.MAX_IMAGE_DIMENSION || 1200);
const IMAGE_COMPRESSION_QUALITY = Number(process.env.IMAGE_COMPRESSION_QUALITY || 50);

let cloudinaryConfigured = false;

class ImageServiceError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'ImageServiceError';
    this.statusCode = statusCode;
  }
}

const assertAllowedEntity = (entityType) => {
  if (!ALLOWED_IMAGE_ENTITIES.includes(entityType)) {
    throw new ImageServiceError('Invalid entity type', 400);
  }
};

const hasCloudinaryConfig = () => {
  return Boolean(
    process.env.CLOUDINARY_URL ||
    (
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
    )
  );
};

const configureCloudinary = () => {
  if (cloudinaryConfigured) return;

  if (!hasCloudinaryConfig()) {
    throw new ImageServiceError('Cloudinary is not configured', 500);
  }

  if (process.env.CLOUDINARY_URL) {
    cloudinary.config({ secure: true });
  } else {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true
    });
  }

  cloudinaryConfigured = true;
};

const isDataUri = (value) => /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(value);
const isHttpUrl = (value) => /^https?:\/\//i.test(value);

const normalizeFilename = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const providerForUrl = (url) => {
  if (/^https?:\/\/res\.cloudinary\.com\//i.test(url)) return 'cloudinary';
  return 'remote';
};

const normalizeImageInput = (value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  if (value && typeof value === 'object') {
    const normalized = { ...value };

    if (typeof normalized.imageData === 'string') {
      normalized.imageData = normalized.imageData.trim();
    }
    if (typeof normalized.imageUrl === 'string') {
      normalized.imageUrl = normalized.imageUrl.trim();
    }
    if (typeof normalized.url === 'string') {
      normalized.url = normalized.url.trim();
    }
    if (typeof normalized.data === 'string') {
      normalized.data = normalized.data.trim();
    }
    normalized.filename = normalizeFilename(normalized.filename);
    normalized.original_filename = normalizeFilename(normalized.original_filename);
    normalized.originalFilename = normalizeFilename(normalized.originalFilename);

    const source = normalized.imageData || normalized.imageUrl || normalized.url || normalized.data;
    if (!source) {
      return null;
    }

    return normalized;
  }

  return null;
};

const getImageFilename = (imageInput) => {
  if (!imageInput || typeof imageInput !== 'object') return null;
  return normalizeFilename(imageInput.filename)
    || normalizeFilename(imageInput.original_filename)
    || normalizeFilename(imageInput.originalFilename);
};

const withFallbackFilename = (imageInput, fallbackFilename) => {
  const filename = normalizeFilename(fallbackFilename);
  if (!filename || getImageFilename(imageInput)) return imageInput;

  if (typeof imageInput === 'string') {
    return { imageData: imageInput, filename };
  }

  return { ...imageInput, filename };
};

const normalizeImagePayload = ({ imageData, imageArray, images, filename, filenames } = {}) => {
  const rawImages = Array.isArray(images)
    ? images
    : Array.isArray(imageArray)
      ? imageArray
      : imageData
        ? [imageData]
        : [];

  const normalized = rawImages
    .map((imageInput, index) => {
      const normalizedInput = normalizeImageInput(imageInput);
      const fallbackFilename = Array.isArray(filenames) ? filenames[index] : index === 0 ? filename : null;
      return normalizedInput ? withFallbackFilename(normalizedInput, fallbackFilename) : null;
    })
    .filter(Boolean);

  if (normalized.length > MAX_IMAGES_PER_ENTITY) {
    throw new ImageServiceError(`Too many images. Maximum is ${MAX_IMAGES_PER_ENTITY}.`, 413);
  }

  return normalized;
};

const ensureEntityExists = async (db, entityType, entityId) => {
  assertAllowedEntity(entityType);

  const tableName = ENTITY_TABLE_MAP[entityType] || entityType;

  const result = await db.query(
    `SELECT id FROM ${tableName} WHERE id = $1 AND is_deleted = false`,
    [entityId]
  );

  if (result.rows.length === 0) {
    throw new ImageServiceError('Entity not found', 404);
  }
};

/**
 * Compress & resize a base64 data URI image using sharp before uploading.
 * Reduces dimensions to MAX_IMAGE_DIMENSION (default 1200px) on the longest side
 * and compresses to IMAGE_COMPRESSION_QUALITY (default 70%).
 * Returns a new data URI string (JPEG for better compression).
 */
const compressImage = async (dataUri) => {
  // Extract base64 payload (strip the data:image/...;base64, prefix)
  const base64Payload = dataUri.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
  const imageBuffer = Buffer.from(base64Payload, 'base64');

  const compressedBuffer = await sharp(imageBuffer)
    .resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, {
      fit: 'inside',        // only resize if larger, keep aspect ratio
      withoutEnlargement: true
    })
    .jpeg({ quality: IMAGE_COMPRESSION_QUALITY, progressive: true })
    .toBuffer();

  return compressedBuffer; // Return Buffer directly
};

const uploadToCloudinary = async (dataUri, entityType, entityId, options = {}) => {
  const t0 = Date.now();
  if (dataUri.length > MAX_DATA_URI_LENGTH) {
    throw new ImageServiceError('Image payload is too large', 413);
  }

  configureCloudinary();

  // Compress image on server side before uploading to Cloudinary
  // compressImage now returns a Buffer (not base64) for direct upload
  let imageBuffer;
  try {
    imageBuffer = await compressImage(dataUri);
  } catch (compressErr) {
    // If sharp fails (e.g., corrupt image), fall back to original dataUri
    console.warn('Image compression failed, uploading original:', compressErr.message);
    // Extract raw buffer from original dataUri for upload
    const base64Payload = dataUri.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
    imageBuffer = Buffer.from(base64Payload, 'base64');
  }
  console.log(`[uploadToCloudinary] compress done in ${Date.now() - t0}ms`);

  const rootFolder = process.env.CLOUDINARY_UPLOAD_FOLDER || 'camera-rental';
  const imageQuality = process.env.CLOUDINARY_IMAGE_QUALITY || 'auto:low';
  const imageFormat = process.env.CLOUDINARY_IMAGE_FORMAT || 'auto';

  const tUpload = Date.now();
  // Use upload_stream to pipe Buffer directly — avoids base64 encoding overhead
  const result = await new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `${rootFolder}/${entityType}/${entityId}`,
        resource_type: 'image',
        use_filename: Boolean(options.filename),
        unique_filename: true,
        quality: imageQuality,
        fetch_format: imageFormat,
        timeout: 30000,
        ...(options.filename ? { filename_override: options.filename } : {})
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    Readable.from(imageBuffer).pipe(uploadStream);
  });
  console.log(`[uploadToCloudinary] Cloudinary upload: ${Date.now() - tUpload}ms | total: ${Date.now() - t0}ms`);
  return result;
};

const insertImageRow = async (db, image) => {
  const result = await db.query(
    `
      INSERT INTO entity_images (
        entity_type, entity_id, image_url, secure_url, public_id, provider,
        resource_type, format, width, height, bytes, sort_order, is_primary,
        metadata, inserted_by, updated_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15, $15)
      RETURNING *
    `,
    [
      image.entityType,
      image.entityId,
      image.imageUrl,
      image.secureUrl || image.imageUrl,
      image.publicId || null,
      image.provider,
      image.resourceType || 'image',
      image.format || null,
      image.width || null,
      image.height || null,
      image.bytes || null,
      image.sortOrder,
      image.isPrimary,
      JSON.stringify(image.metadata || {}),
      image.userId || null
    ]
  );

  return result.rows[0];
};

const replaceEntityImages = async (db, entityType, entityId, imageInputs, userId) => {
  const t0 = Date.now();
  assertAllowedEntity(entityType);
  await ensureEntityExists(db, entityType, entityId);

  const images = Array.isArray(imageInputs)
    ? imageInputs.map(normalizeImageInput).filter(Boolean)
    : [];

  if (images.length === 0) {
    throw new ImageServiceError('No image data provided', 400);
  }

  if (images.length > MAX_IMAGES_PER_ENTITY) {
    throw new ImageServiceError(`Too many images. Maximum is ${MAX_IMAGES_PER_ENTITY}.`, 413);
  }

  // ── Phase 1 (SYNC): compress images + prepare DB ──
  // Run SELECT and soft-delete UPDATE in parallel
  const [existingResult] = await Promise.all([
    db.query(
      `SELECT * FROM entity_images WHERE entity_type = $1 AND entity_id = $2 ORDER BY sort_order ASC, id ASC`,
      [entityType, entityId]
    ),
    db.query(
      `UPDATE entity_images SET is_deleted = true, is_primary = false, updated_at = NOW(), updated_by = $3 WHERE entity_type = $1 AND entity_id = $2 AND is_deleted = false`,
      [entityType, entityId, userId || null]
    )
  ]);

  const existingByUrl = new Map();
  for (const row of existingResult.rows) {
    if (row.image_url) existingByUrl.set(row.image_url, row);
    if (row.secure_url) existingByUrl.set(row.secure_url, row);
  }

  // ── Process images: compress data URIs, prepare DB rows ──
  // For data URIs: compress now, insert placeholder with base64, upload to Cloudinary later
  // For HTTP URLs: reuse existing or insert as-is now
  const bgUploads = []; // Background: upload to Cloudinary then UPDATE DB row

  const syncResults = await Promise.all(images.map(async (imageInput, index) => {
    const source = typeof imageInput === 'string'
      ? imageInput
      : imageInput.imageData || imageInput.imageUrl || imageInput.url || imageInput.data;
    const filename = typeof imageInput === 'string' ? null : getImageFilename(imageInput);
    const isPrimary = index === 0;

    if (isDataUri(source)) {
      // Compress now (fast), insert placeholder with base64, schedule Cloudinary upload for later
      let compressedBuffer;
      try {
        compressedBuffer = await compressImage(source);
      } catch (compressErr) {
        console.warn('Image compression failed, using original:', compressErr.message);
        const base64Payload = source.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
        compressedBuffer = Buffer.from(base64Payload, 'base64');
      }
      const previewUrl = `data:image/jpeg;base64,${compressedBuffer.toString('base64')}`;

      // Insert placeholder row NOW so GET queries can return it immediately
      const placeholderRow = await insertImageRow(db, {
        entityType, entityId,
        imageUrl: previewUrl, secureUrl: previewUrl, publicId: null,
        provider: 'processing',
        resourceType: 'image', format: 'jpg', width: null, height: null, bytes: compressedBuffer.length,
        sortOrder: index, isPrimary,
        metadata: { pending_cloudinary: true, original_filename: filename || null },
        userId
      });

      // Schedule background: upload to Cloudinary → UPDATE this row
      bgUploads.push({
        dbRowId: placeholderRow.id,
        index, entityType, entityId,
        buffer: compressedBuffer,
        filename, isPrimary, userId
      });

      return { type: 'dataUri', index, placeholderRow };
    }

    if (!isHttpUrl(source)) {
      throw new ImageServiceError('Unsupported image source', 400);
    }

    const existing = existingByUrl.get(source);
    if (existing) {
      // Reactivate existing row
      return { type: 'existing', existingId: existing.id, index, isPrimary, userId };
    }

    // New HTTP URL → insert to DB now
    const row = {
      entityType, entityId,
      imageUrl: source, secureUrl: source, publicId: null,
      provider: providerForUrl(source),
      sortOrder: index, isPrimary,
      metadata: { source: 'existing_url', ...(filename ? { original_filename: filename } : {}) },
      userId
    };
    return { type: 'httpUrl', index, row };
  }));

  // ── Insert/update DB for HTTP URLs + reactivated existing rows (fast) ──
  const httpRows = await Promise.all(
    syncResults
      .filter(r => r.type === 'httpUrl' || r.type === 'existing')
      .sort((a, b) => a.index - b.index)
      .map(async (item) => {
        if (item.type === 'existing') {
          const res = await db.query(
            `UPDATE entity_images SET is_deleted = false, is_primary = $1, sort_order = $2, updated_at = NOW(), updated_by = $3 WHERE id = $4 RETURNING *`,
            [item.isPrimary, item.index, userId || null, item.existingId]
          );
          return res.rows[0];
        } else {
          return insertImageRow(db, item.row);
        }
      })
  );

  // ── Merge dataUri placeholder rows + httpRows, sorted by index ──
  const dataUriRows = syncResults
    .filter(r => r.type === 'dataUri' && r.placeholderRow)
    .map(r => r.placeholderRow);

  const allRows = [...dataUriRows, ...httpRows.filter(Boolean)]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  console.log(`[replaceEntityImages] sync done: ${Date.now() - t0}ms (${bgUploads.length} bg uploads pending)`);

  // ── Phase 2 (ASYNC): Upload to Cloudinary in background, then INSERT to DB ──
  if (bgUploads.length > 0) {
    backgroundCloudinaryUploads(db, bgUploads).catch(err =>
      console.error('[replaceEntityImages] Background Cloudinary upload failed:', err.message)
    );
  }

  return allRows;
};

/**
 * Upload compressed buffers to Cloudinary in background, then INSERT to DB.
 * NOT awaited by the HTTP response.
 */
const backgroundCloudinaryUploads = async (db, uploads) => {
  configureCloudinary();
  const rootFolder = process.env.CLOUDINARY_UPLOAD_FOLDER || 'camera-rental';

  for (const upload of uploads) {
    try {
      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: `${rootFolder}/${upload.entityType}/${upload.entityId}`,
            resource_type: 'image',
            use_filename: Boolean(upload.filename),
            unique_filename: true,
            timeout: 30000,
            ...(upload.filename ? { filename_override: upload.filename } : {})
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        Readable.from(upload.buffer).pipe(uploadStream);
      });

      const secureUrl = result.secure_url || result.url;
      // Hard-delete the base64 placeholder row, then INSERT a clean Cloudinary row
      await db.query(
        `DELETE FROM entity_images WHERE id = $1`,
        [upload.dbRowId]
      );
      await db.query(
        `INSERT INTO entity_images (
           entity_type, entity_id, image_url, secure_url, public_id, provider,
           resource_type, format, width, height, bytes, sort_order, is_primary,
           metadata, inserted_by, updated_by
         ) VALUES ($1, $2, $3, $4, $5, 'cloudinary', $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $14)`,
        [
          upload.entityType, upload.entityId,
          result.url, secureUrl, result.public_id,
          result.resource_type, result.format,
          result.width, result.height, result.bytes,
          upload.index, upload.isPrimary,
          JSON.stringify({ original_filename: upload.filename || result.original_filename || null, asset_id: result.asset_id }),
          upload.userId || null
        ]
      );
      console.log(`[bgUpload] Cloudinary OK → DB inserted: ${upload.entityType}/${upload.entityId}[${upload.index}]`);
    } catch (err) {
      console.error(`[bgUpload] FAILED: ${upload.entityType}/${upload.entityId}[${upload.index}]:`, err.message);
      // Soft-delete the placeholder row, insert a failed row for tracking
      try {
        await db.query(
          `UPDATE entity_images SET is_deleted = true, updated_at = NOW() WHERE id = $1`,
          [upload.dbRowId]
        );
        await db.query(
          `INSERT INTO entity_images (
             entity_type, entity_id, image_url, secure_url, provider,
             sort_order, is_primary, is_deleted,
             metadata, inserted_by, updated_by
           ) VALUES ($1, $2, '', '', 'failed', $3, $4, true, $5::jsonb, $6, $6)`,
          [
            upload.entityType, upload.entityId,
            upload.index, upload.isPrimary,
            JSON.stringify({ upload_error: err.message, upload_failed_at: new Date().toISOString() }),
            upload.userId || null
          ]
        );
      } catch (dbErr) {
        console.error(`[bgUpload] Failed to save error row:`, dbErr.message);
      }
    }
  }
};

const getEntityImageUrls = async (db, entityType, entityId) => {
  assertAllowedEntity(entityType);
  await ensureEntityExists(db, entityType, entityId);

  const result = await db.query(
    `
      SELECT image_url, secure_url
      FROM entity_images
      WHERE entity_type = $1 AND entity_id = $2 AND is_deleted = false
      ORDER BY is_primary DESC, sort_order ASC, id ASC
    `,
    [entityType, entityId]
  );

  return result.rows.map((row) => row.secure_url || row.image_url).filter(Boolean);
};

const softDeleteEntityImages = async (db, entityType, entityId, userId) => {
  assertAllowedEntity(entityType);
  await db.query(
    `
      UPDATE entity_images
      SET is_deleted = true, is_primary = false, updated_at = NOW(), updated_by = $3
      WHERE entity_type = $1 AND entity_id = $2 AND is_deleted = false
    `,
    [entityType, entityId, userId || null]
  );
};

module.exports = {
  ALLOWED_IMAGE_ENTITIES,
  ImageServiceError,
  getEntityImageUrls,
  normalizeImagePayload,
  replaceEntityImages,
  softDeleteEntityImages
};
