import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, Button, Input, Alert } from '../shared/UIComponents';
import { SkeletonTable } from '../shared/Skeleton';
import { AUTH_BASE_URL } from '../../config';
import * as offlineSetupApi from '../../api/offlineSetupApi';

// Offline Setup (Owner only, online dashboard; SYNC-HARDENING-PLAN.md T1.2).
// No main PC yet -> the setup form. Main PC set up -> an overview with
// actions; the form is still one click away (set up an extra PC, or replace
// the main PC). The page never disappears.

const DEFAULT_LOGO = '/logo.jpeg';
const MAX_LOGO_BYTES = 1024 * 1024;
const INSTALLER_URL = `${AUTH_BASE_URL}/downloads`;

const errorText = (err, fallback) => err.response?.data?.error || fallback;

function formatWhen(date) {
  if (!date) return 'never';
  return new Date(date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function ago(date) {
  if (!date) return 'never';
  const mins = Math.round((Date.now() - new Date(date).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

// Setup name + logo, used by both the form and the overview.
function BrandingEditor({ setup, onSaved, onError }) {
  const [name, setName] = useState(setup.setupName || '');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => setName(setup.setupName || ''), [setup.setupName]);

  const run = async (action, message) => {
    setBusy(true);
    try {
      const res = await action();
      onSaved(res.data, message);
    } catch (err) {
      onError(errorText(err, 'Could not save'));
    } finally {
      setBusy(false);
    }
  };

  const saveName = (e) => {
    e.preventDefault();
    run(() => offlineSetupApi.saveSetupName(name), 'Setup name saved');
  };

  const pickLogo = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    // The server checks again, from the file's contents; this just saves a slow upload.
    if (file.size > MAX_LOGO_BYTES) {
      onError('The logo must be 1 MB or smaller.');
      return;
    }
    run(() => offlineSetupApi.uploadLogo(file), 'Logo saved');
  };

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={saveName} className="flex flex-col gap-3">
        <Input
          label="Setup name"
          value={name}
          maxLength={60}
          placeholder="e.g. Bin-Zahid Factory"
          onChange={(e) => setName(e.target.value)}
        />
        <p className="text-sm text-gray-500 -mt-1">Shown in the factory app's title bar and login screen.</p>
        <div>
          <Button type="submit" variant="primary" disabled={busy}>Save name</Button>
        </div>
      </form>

      <div>
        <div className="block text-sm font-medium text-gray-700 mb-2">Logo</div>
        <div className="flex items-center gap-4 flex-wrap">
          <img
            src={setup.logo || DEFAULT_LOGO}
            alt="Current logo"
            className="w-20 h-20 rounded-lg border border-gray-200 object-contain bg-white"
          />
          <div className="flex flex-col gap-2">
            <div className="flex gap-2 flex-wrap">
              <Button variant="secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
                Upload image
              </Button>
              {setup.logo && (
                <Button variant="secondary" disabled={busy}
                  onClick={() => run(() => offlineSetupApi.resetLogo(), 'Default logo restored')}>
                  Use default
                </Button>
              )}
            </div>
            <p className="text-sm text-gray-500">PNG or JPG, at most 1 MB. Shrunk to 256 × 256.</p>
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={pickLogo} />
        </div>
      </div>
    </div>
  );
}

function DeviceTypeChoice({ value, onChange }) {
  const options = [
    { id: 'main', title: 'Main factory PC', text: 'Holds the data. One only. Install FMS on it.' },
    { id: 'extra', title: 'Extra factory PC', text: 'Opens the main PC in a browser. Installs nothing.' },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="radiogroup" aria-label="Device type">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={`text-left rounded-lg border p-4 transition-colors ${value === o.id
            ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
            : 'border-gray-200 hover:bg-gray-50'}`}
        >
          <div className="font-semibold text-gray-800">{o.title}</div>
          <div className="text-sm text-gray-600 mt-1">{o.text}</div>
        </button>
      ))}
    </div>
  );
}

function SetupCodePanel({ mainPc, initialReplace, onError, onCreated }) {
  const [confirmReplace, setConfirmReplace] = useState(!!initialReplace);
  const [code, setCode] = useState(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      const res = await offlineSetupApi.createSetupCode();
      setCode(res.data);
      onCreated();
    } catch (err) {
      onError(errorText(err, 'Could not create a setup code'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {mainPc && (
        <label className="flex items-start gap-3 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-gray-800">
          <input
            type="checkbox"
            className="mt-1"
            checked={confirmReplace}
            onChange={(e) => setConfirmReplace(e.target.checked)}
          />
          <span>
            <b>Replace the current main PC</b> (set up {formatWhen(mainPc.registeredAt)}). As soon as the new PC
            enters the code, the old one stops uploading. Changes that never left the old PC will not reach this
            server.
          </span>
        </label>
      )}

      {code ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="text-sm text-gray-600">One-time setup code</div>
          <div className="font-mono text-3xl font-bold tracking-widest text-gray-900 my-1 select-all">{code.code}</div>
          <div className="text-sm text-gray-600">
            Works once, until {formatWhen(code.expiresAt)}. It is shown only now — write it down or keep this page open.
            Creating another code cancels this one.
          </div>
        </div>
      ) : (
        <div>
          <Button variant="primary" disabled={busy || (mainPc && !confirmReplace)} onClick={create}>
            {busy ? 'Creating…' : 'Create one-time setup code'}
          </Button>
        </div>
      )}
    </div>
  );
}

function ExtraPcInstructions({ address, hasMainPc }) {
  return (
    <div className="flex flex-col gap-2 text-gray-700">
      {!hasMainPc && (
        <Alert type="warning" message="Set up the main factory PC first: extra PCs open it over the factory network." />
      )}
      <p>No download. On the extra PC, open a browser (Chrome or Edge) and go to:</p>
      <div className="font-mono text-lg font-semibold text-gray-900 select-all">{address}</div>
      <p className="text-sm text-gray-500">
        The main PC must be switched on, with FMS running, and on the same factory network. If the name does not
        work, use the main PC's fixed network number instead, e.g. http://192.168.1.20:48620.
      </p>
    </div>
  );
}

function SetupForm({ data, initialDevice, initialReplace, onBranding, onError, onCodeCreated, onCancel }) {
  const [device, setDevice] = useState(initialDevice || 'main');

  return (
    <Card title={data.mainPc ? 'Set up a PC' : 'Set up the factory'}>
      <div className="flex flex-col gap-6">
        <section>
          <h3 className="font-semibold text-gray-800 mb-3">1. Device type</h3>
          <DeviceTypeChoice value={device} onChange={setDevice} />
        </section>

        {device === 'main' ? (
          <>
            <section>
              <h3 className="font-semibold text-gray-800 mb-3">2. Setup name and logo</h3>
              <BrandingEditor setup={data} onSaved={onBranding} onError={onError} />
            </section>
            <section>
              <h3 className="font-semibold text-gray-800 mb-3">3. One-time setup code</h3>
              <SetupCodePanel mainPc={data.mainPc} initialReplace={initialReplace} onError={onError} onCreated={onCodeCreated} />
            </section>
            <section>
              <h3 className="font-semibold text-gray-800 mb-3">4. Install on the main PC</h3>
              <ol className="list-decimal pl-5 text-gray-700 space-y-1">
                <li>
                  On the main PC, open{' '}
                  <a href={INSTALLER_URL} target="_blank" rel="noreferrer" className="text-[var(--color-accent)] font-medium underline">
                    {INSTALLER_URL.replace(/^https?:\/\//, '')}
                  </a>{' '}
                  and download the installer (the same one for everyone).
                </li>
                <li>Install FMS. The installer asks where to put the program.</li>
                <li>Start FMS and type in the setup code. It copies this server's data and picks up the name and logo.</li>
              </ol>
            </section>
          </>
        ) : (
          <section>
            <h3 className="font-semibold text-gray-800 mb-3">2. Open FMS on the extra PC</h3>
            <ExtraPcInstructions address={data.extraPcAddress} hasMainPc={!!data.mainPc} />
          </section>
        )}

        {onCancel && (
          <div>
            <Button variant="secondary" onClick={onCancel}>Back to overview</Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function Overview({ data, onBranding, onError, onSetUp }) {
  const { mainPc } = data;
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Main PC">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-gray-700">
            <dt className="font-medium">Status</dt>
            <dd>{mainPc.online ? '🟢 Online' : '🔴 No upload in the last 2 minutes'}</dd>
            <dt className="font-medium">Last upload</dt>
            <dd>{mainPc.lastUploadAt ? `${ago(mainPc.lastUploadAt)} (${formatWhen(mainPc.lastUploadAt)})` : 'none yet'}</dd>
            <dt className="font-medium">Set up</dt>
            <dd>{formatWhen(mainPc.registeredAt)}</dd>
          </dl>
          <p className="text-sm text-gray-500 mt-3">
            The main PC uploads whenever something changes, so a quiet PC can show 🔴 while it is fine.
          </p>
        </Card>

        <Card title="Setup name and logo">
          <BrandingEditor setup={data} onSaved={onBranding} onError={onError} />
          <p className="text-sm text-gray-500 mt-3">The main PC picks up a change within an hour.</p>
        </Card>

        <Card title="Extra factory PCs">
          <ExtraPcInstructions address={data.extraPcAddress} hasMainPc />
        </Card>

        <Card title="Installer">
          <p className="text-gray-700 mb-3">Download the installer again, e.g. to reinstall the same PC.</p>
          <a href={INSTALLER_URL} target="_blank" rel="noreferrer"
            className="inline-block font-semibold rounded px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800">
            Download installer
          </a>
        </Card>
      </div>

      <Card title="Replace main PC">
        <p className="text-gray-700 mb-3">
          For a new or repaired main PC. You get a new setup code; once the new PC uses it, the old PC is blocked
          automatically.
        </p>
        <Button variant="danger" onClick={() => onSetUp('main', true)}>Replace main PC…</Button>
      </Card>
    </div>
  );
}

export default function OfflineSetup() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  // null = overview (or the form, when there is no main PC); else the form's starting choices
  const [form, setForm] = useState(null);
  const [waitingForPc, setWaitingForPc] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await offlineSetupApi.getOfflineSetup();
      setData(res.data);
      return res.data;
    } catch (err) {
      setError(errorText(err, 'Could not load Offline Setup'));
      return null;
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // After a code is created, watch for the PC to register, then show the overview.
  useEffect(() => {
    if (!waitingForPc) return undefined;
    const registeredBefore = data?.mainPc?.registeredAt || null;
    const timer = setInterval(async () => {
      const fresh = await load();
      if (fresh?.mainPc && fresh.mainPc.registeredAt !== registeredBefore) {
        setWaitingForPc(false);
        setForm(null);
        setSuccess('The main PC is registered.');
      }
    }, 10000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingForPc, load]);

  const onBranding = (setup, message) => {
    setData((d) => ({ ...d, setupName: setup.name, logo: setup.logo, updatedAt: setup.updatedAt }));
    setError('');
    setSuccess(message);
  };
  const onError = (message) => { setSuccess(''); setError(message); };

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Offline Setup</h1>

      {error && <Alert type="error" message={error} onClose={() => setError('')} />}
      {success && <Alert type="success" message={success} onClose={() => setSuccess('')} />}

      {!data ? (
        <Card><SkeletonTable rows={4} columns={2} /></Card>
      ) : !data.mainPc || form ? (
        <SetupForm
          key={form ? `${form.device}-${form.replace}` : 'first'}
          data={data}
          initialDevice={form?.device}
          initialReplace={form?.replace}
          onBranding={onBranding}
          onError={onError}
          onCodeCreated={() => setWaitingForPc(true)}
          onCancel={data.mainPc ? () => { setForm(null); setWaitingForPc(false); } : null}
        />
      ) : (
        <>
          <div className="mb-4">
            <Button variant="secondary" onClick={() => setForm({ device: 'extra', replace: false })}>
              Set up an extra PC
            </Button>
          </div>
          <Overview
            data={data}
            onBranding={onBranding}
            onError={onError}
            onSetUp={(device, replace) => setForm({ device, replace })}
          />
        </>
      )}
    </div>
  );
}
