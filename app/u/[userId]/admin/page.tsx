'use client';

import { useState } from 'react';
import Papa from 'papaparse';

export default function Admin({ params }: { params: { userId: string } }) {
  const [adminKey, setAdminKey] = useState('');
  const [message, setMessage] = useState('');
  const [csvText, setCsvText] = useState('code,name\n4012,アクシス\n3939,カナミックネットワーク\n4286,ＣＬホールディングス');
  const [loading, setLoading] = useState(false);

  async function upload() {
    setLoading(true);
    setMessage('');
    try {
      const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
      const res = await fetch('/api/watchlist/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: params.userId, adminKey, rows: parsed.data }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'upload failed');
      setMessage(`登録完了: ${json.count}件`);
    } catch (error) {
      setMessage(`エラー: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="wrap">
      <section className="section">
        <h1>{params.userId} CSV登録</h1>
        <p>CSV形式: <code>code,name</code></p>
        <label>管理キー</label>
        <input value={adminKey} onChange={(e) => setAdminKey(e.target.value)} placeholder="ADMIN_UPLOAD_KEY" />
        <label>CSV</label>
        <textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} rows={14} />
        <button className="btn" onClick={upload} disabled={loading}>{loading ? '登録中...' : '登録'}</button>
        {message ? <p>{message}</p> : null}
      </section>
    </main>
  );
}
