import React, { useEffect, useState } from 'react';
import { Camera, Search, ShieldCheck } from 'lucide-react';
import { getPhotoboothAccess, setPhotoboothAccess } from '../api/client';

export default function PhotoboothAccess() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    getPhotoboothAccess().then(response => setUsers(response.data)).catch(err => setError(err?.response?.data?.error || 'Không tải được danh sách tài khoản.'));
  }, []);
  async function changeAccess(user) {
    setSaving(user.id); setError('');
    try {
      const allowed = !user.allowed;
      await setPhotoboothAccess(user.id, allowed);
      setUsers(current => current.map(item => item.id === user.id ? { ...item, allowed } : item));
    } catch (err) { setError(err?.response?.data?.error || 'Không lưu được quyền truy cập.'); }
    finally { setSaving(null); }
  }
  const visible = users.filter(user => `${user.full_name || ''} ${user.username}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')));
  return <div className="max-w-5xl mx-auto p-5 md:p-8 space-y-5">
    <div className="flex items-start gap-3"><div className="rounded-xl bg-pink-100 text-pink-600 p-3"><Camera size={23} /></div><div><h1 className="text-2xl font-bold text-gray-900">Quyền truy cập Photobooth</h1><p className="text-sm text-gray-500 mt-1">Cấp quyền cho nhân viên vận hành hoặc nhà đầu tư xem Photobooth. Nhân viên không xem được báo cáo doanh thu và tài chính; nhà đầu tư chỉ được xem. Quản trị viên luôn có quyền truy cập.</p></div></div>
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden"><div className="p-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3"><div><strong className="text-gray-800">Tài khoản hệ thống</strong><p className="text-xs text-gray-500">{users.filter(user => user.allowed).length} tài khoản được cấp quyền</p></div><label className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 text-gray-500"><Search size={16} /><input className="outline-none text-sm text-gray-800" placeholder="Tìm tên hoặc tài khoản" value={search} onChange={event => setSearch(event.target.value)} /></label></div>
      {error && <div role="alert" className="m-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="divide-y divide-gray-100">{visible.map(user => { const admin = user.roles?.includes('admin'); const investor = user.roles?.includes('investor'); return <div key={user.id} className="flex items-center justify-between gap-4 px-4 py-3"><div className="min-w-0"><strong className="block truncate text-sm text-gray-900">{user.full_name || user.username}</strong><span className="text-xs text-gray-500">@{user.username} · {admin ? 'Quản trị viên' : investor ? 'Nhà đầu tư · Chỉ xem' : 'Nhân viên · Không xem báo cáo'}</span></div>{admin ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><ShieldCheck size={15} /> Luôn có quyền</span> : <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer"><input type="checkbox" className="h-4 w-4 accent-pink-600" checked={user.allowed} disabled={saving === user.id} onChange={() => changeAccess(user)} /><span>{user.allowed ? 'Được truy cập' : 'Chưa cấp quyền'}</span></label>}</div>; })}{!visible.length && <div className="p-8 text-center text-sm text-gray-500">Không có tài khoản phù hợp.</div>}</div>
    </div>
  </div>;
}
