import { useState } from 'react';

const NLPSearch = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [sql, setSql] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/nlp-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const data = await res.json();
      if (data.error) return setError(data.error);
      setResults(data.data);
      setSql(data.sql);
    } catch (e) {
      setError('Search failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <input
        type="text"
        placeholder='e.g. "gross profit for cement in January" or "unpaid invoices this month"'
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleSearch()}
      />
      <button onClick={handleSearch} disabled={loading}>
        {loading ? 'Searching...' : 'Search'}
      </button>

      {error && <p style={{ color: 'red' }}>{error}</p>}
      {sql && <code style={{ display: 'block', margin: '8px 0' }}>{sql}</code>}

      {results.length > 0 && (
        <table>
          <thead>
            <tr>{Object.keys(results[0]).map(k => <th key={k}>{k}</th>)}</tr>
          </thead>
          <tbody>
            {results.map((row, i) => (
              <tr key={i}>
                {Object.values(row).map((v, j) => <td key={j}>{v}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default NLPSearch;