'use client';

import { useEffect, useMemo, useState } from 'react';
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

type WatchRow = {
  code: string;
  name?: string | null;
  memo?: string | null;
  is_active?: boolean | null;
  updated_at?: string | null;
};

function rowsToCsv(rows: WatchRow[]) {
  if (!rows || rows.length === 0) return 'code,name\n';
  const body = rows.map((r) => `${r.code},${r.name || ''}`).join('\n');
  return `code,name\n${body}`;
}

export default function Admin() {
  const params = useParams<{ userId: string }>();
  const userId = useMemo(() => String(params?.userId || ''), [params]);

  const [adminKey, setAdminKey] = useState('');
  const [message, setMessage] = useState('');
  const [csvText, setCsvText] = useState('code,name\n');
  const [loading, setLoading] = useState(false);
  const [loadingCurrent, setLoadingCurrent] = useState(true);
  const [currentRows, setCurrentRows] = useState<WatchRow[]>([]);

  async function loadCurrent() {
    if (!userId) return;
    setLoadingCurrent(true);
    setMessage('');
    try {
      const res = await fetch(`/api/watchlist/${userId}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'watchlist fetch failed');
      const rows = (json.rows || []) as WatchRow[];
      setCurrentRows(rows);
      setCsvText(rowsToCsv(rows));
    } catch (error) {
      setMessage(`現在の登録CSV取得エラー: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoadingCurrent(false);
    }
  }

  useEffect(() => {
    loadCurrent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

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
      setMessage(`登録完了: ${json.count}件。core のGitHub Actionsを実行すると分析結果が更新されます。`);
      await loadCurrent();
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
        <p>この画面では、ユーザごとの監視銘柄CSVを更新します。保存すると既存の有効リストはこのCSVで置き換わります。</p>
        <p>CSV形式: <code>code,name</code></p>

        <div className="grid">
          <div>
            <label>管理キー</label>
            <input className="input" value={adminKey} onChange={(e) => setAdminKey(e.target.value)} placeholder={`${userId} 用の管理キー`} />
          </div>
          <div>
            <label>現在の登録件数</label>
            <div className="card"><b>{loadingCurrent ? '読込中' : currentRows.length}</b></div>
          </div>
        </div>

        <label>現在登録されているCSV / 更新後CSV</label>
        <textarea className="input" value={csvText} onChange={(e) => setCsvText(e.target.value)} rows={18} />
        <div style={{ display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
          <button className="btn" onClick={upload} disabled={loading || !userId}>{loading ? '登録中...' : 'CSVを保存'}</button>
          <button className="btn" type="button" onClick={loadCurrent} disabled={loadingCurrent}>現在の登録CSVを再読込</button>
          <a className="btn" href={`/u/${userId}`}>ダッシュボードへ</a>
        </div>
        {message ? <p>{message}</p> : null}
      </section>
    </main>
  );
}
