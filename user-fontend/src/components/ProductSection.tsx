import { ProductCarousel } from './ProductCarousel';

export type PublicEquipment = {
  id: number;
  name: string;
  category?: string | null;
  brand?: string | null;
  model?: string | null;
  price_per_day?: string | number | null;
  condition?: string | null;
  image?: string | null;
  rental_count?: number | null;
};

async function getPopularEquipment() {
  const apiUrl =
    process.env.API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:5000';
  const endpoint = `${apiUrl}/api/equipment/public?limit=5&sortBy=popular&sortOrder=DESC`;

  console.info('[ProductSection] Fetching popular equipment', {
    apiUrl,
    endpoint,
    hasApiUrlEnv: Boolean(process.env.API_URL),
    hasNextPublicApiUrlEnv: Boolean(process.env.NEXT_PUBLIC_API_URL),
  });

  try {
    const response = await fetch(endpoint, { cache: 'no-store' });

    console.info('[ProductSection] Popular equipment response', {
      status: response.status,
      ok: response.ok,
    });

    if (!response.ok) {
      const body = await response.text();

      console.warn('[ProductSection] Popular equipment request failed', {
        status: response.status,
        body: body.slice(0, 500),
      });

      return [];
    }

    const payload = (await response.json()) as { data?: PublicEquipment[] };
    const products = payload.data?.length ? payload.data : [];

    console.info('[ProductSection] Popular equipment parsed', {
      count: products.length,
      ids: products.map((product) => product.id),
    });

    return products;
  } catch (error) {
    console.error('[ProductSection] Popular equipment fetch errored', error);
    return [];
  }
}

export async function ProductSection() {
  const products = await getPopularEquipment();

  return (
    <section id='products' className='bg-white py-16'>
      <div className='mx-auto max-w-7xl px-5 lg:px-8'>
        <div className='mb-8 flex items-end justify-between gap-4'>
          <div>
            <span className='rounded-sm bg-[#f1dfc8] px-3 py-1 text-xs font-bold uppercase text-[#6b4b25]'>
              M&aacute;y hot
            </span>
            <h2 className='mt-3 text-3xl font-bold lg:text-4xl'>
              M&aacute;y &#7843;nh &#273;&#432;&#7907;c thu&ecirc; nhi&#7873;u
              nh&#7845;t
            </h2>
            <p className='mt-2 text-[#6d6660]'>
              Nh&#7919;ng l&#7921;a ch&#7885;n h&agrave;ng &#273;&#7847;u
              c&#7911;a kh&aacute;ch h&agrave;ng t&#7841;i Snappro
            </p>
          </div>
          <a className='hidden text-sm font-bold sm:block' href='#products'>
            Xem t&#7845;t c&#7843; -&gt;
          </a>
        </div>

        <ProductCarousel products={[...products, ...products]} />
      </div>
    </section>
  );
}
