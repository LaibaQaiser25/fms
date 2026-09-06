import { useState } from 'react';
import { API_BASE_URL } from '../config';

const NLPSearch = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [sql, setSql] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    if (!query.trim()) {
      setError('Please enter a search query');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      console.log('🔍 NLP Search Query:', query);

      const res = await fetch(`${API_BASE_URL}/nlp/nlp-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Server error: ${res.status} - ${errorText}`);
      }

      const data = await res.json();
      console.log('✅ Search Results:', data);
      console.log('📊 Generated SQL:', data.sql);
      console.log('📈 Data:', data.data);

      setResults(data.data || []);
      setSql(data.sql || '');

      // Log formatted results to console
      if (data.data && data.data.length > 0) {
        console.table(data.data);
      } else {
        console.log('No results found');
      }
    } catch (e) {
      console.error('❌ Search failed:', e.message);
      setError(`Search failed: ${e.message}`);
      setResults([]);
      setSql('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '900px', margin: '0 auto' }}>
      <h2>NLP Search</h2>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <input
          type="text"
          placeholder='e.g. "ledger history of ali" or "unpaid invoices this month"'
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          style={{
            flex: 1,
            padding: '10px',
            fontSize: '14px',
            border: '1px solid #ccc',
            borderRadius: '4px'
          }}
        />
        <button 
          onClick={handleSearch} 
          disabled={loading}
          style={{
            padding: '10px 20px',
            backgroundColor: loading ? '#ccc' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontWeight: 'bold'
          }}
        >
          {loading ? '🔄 Searching...' : '🔍 Search'}
        </button>
      </div>

      {error && (
        <div style={{ 
          padding: '12px', 
          backgroundColor: '#f8d7da', 
          color: '#721c24', 
          borderRadius: '4px', 
          marginBottom: '15px',
          border: '1px solid #f5c6cb'
        }}>
          {error}
        </div>
      )}

      {sql && (
        <div style={{ marginBottom: '20px' }}>
          <h4>Generated SQL:</h4>
          <code style={{
            display: 'block',
            backgroundColor: '#f5f5f5',
            padding: '12px',
            borderRadius: '4px',
            overflowX: 'auto',
            border: '1px solid #ddd',
            fontSize: '12px',
            fontFamily: 'monospace'
          }}>
            {sql}
          </code>
        </div>
      )}

      {results.length > 0 && (
        <div>
          <h4>Results ({results.length} rows):</h4>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            border: '1px solid #ddd',
            marginTop: '10px'
          }}>
            <thead>
              <tr style={{ backgroundColor: '#f5f5f5' }}>
                {Object.keys(results[0]).map(k => (
                  <th key={k} style={{
                    padding: '12px',
                    textAlign: 'left',
                    borderBottom: '2px solid #ddd',
                    fontWeight: 'bold'
                  }}>
                    {k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map((row, i) => (
                <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#f9f9f9' }}>
                  {Object.values(row).map((v, j) => (
                    <td key={j} style={{
                      padding: '10px 12px',
                      borderBottom: '1px solid #ddd'
                    }}>
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && query && results.length === 0 && !error && (
        <div style={{
          padding: '20px',
          backgroundColor: '#e7f3ff',
          borderRadius: '4px',
          textAlign: 'center',
          color: '#0056b3'
        }}>
          No results found for your query. Try a different search.
        </div>
      )}
    </div>
  );
};

export default NLPSearch;