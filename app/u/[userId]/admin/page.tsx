'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Papa from 'papaparse';

type CsvRow = {
  code?: string;
  Code?: string;
  銘柄コード?: string;
  name?: string;
  Name?: string;
  銘柄名?: string;
};

export default function Admin() {
  const params = useParams<{ userId: string }>();
  const userId = useMemo(() => String(params?.userId || ''), [params]);

  const [adminKey, setAdminKey] = useState('');
  const [message, setMessage] = useState('');
  const [csvText, setCsvText] = useState('code,name\n4012,アクシス\n3939,カナミックネットワーク\n4286,ＣＬホールディングス');
  const [loading, setLoading] = useState(false);

  async function upload() {
    setLoading(true);
    setMessage('');
    try {
      const parsed = Papa.parse<CsvRow>(csvText, { header: true, skipEmptyLines: true });
      if (parsed.errors.length > 0) {
        throw new Error(parsed.errors[0]?.message || 'CSV parse error');
      }
      const res = await fetch('/api/watchlist/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, adminKey, rows: parsed.data }),
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
        <h1>{userId} CSV登録</h1>
        <p>CSV形式: <code>code,name</code></p>
        <label>管理キー</label>
        <input value={adminKey} onChange={(e) => setAdminKey(e.target.value)} placeholder="ADMIN_UPLOAD_KEY" />
        <label>CSV</label>
        <textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} rows={14} />
        <button className="btn" onClick={upload} disabled={loading || !userId}>{loading ? '登録中...' : '登録'}</button>
        {message ? <p>{message}</p> : null}
      </section>
    </main>
  );
}
