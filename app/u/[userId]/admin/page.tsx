'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Papa from 'papaparse';

export default function Admin() {
  const params = useParams<{ userId: string }>();
  const userId = params.userId;
  const [adminKey, setAdminKey] = useState('');
  const [message, setMessage] = useState('');
  const [csvText, setCsvText] = useState('code,name\n4012,\n3939,\n4286,');
  const [loading, setLoading] = useState(false);

  async function upload() {
    setLoading(true);
    setMessage('保存中...');
    try {
      const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
      const res = await fetch('/api/watchlist/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, adminKey, rows: parsed.data }),
      });
      const data = await res.json();
      setMessage(res.ok ? `保存しました: ${data.count}件` : `エラー: ${data.error}`);
    } catch (e) {
      setMessage(`エラー: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="wrap">
      <section className="section">
        <h1>Watchlist管理: {userId}</h1>
        <p>CSV形式: <code>code,name,memo</code></p>
        <div className="grid">
          <div>
            <label>編集PIN</label>
            <input className="input" value={adminKey} onChange={(e) => setAdminKey(e.target.value)} />
          </div>
          <div style={{ alignSelf: 'end' }}>
            <button className="btn" onClick={upload} disabled={loading}>{loading ? '保存中...' : '保存'}</button>
          </div>
        </div>
        <textarea rows={16} className="input" value={csvText} onChange={(e) => setCsvText(e.target.value)} />
        <p>{message}</p>
      </section>
    </main>
  );
}
