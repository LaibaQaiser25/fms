exports.up = (pgm) => {
  pgm.sql(`

    -- Every WhatsApp message n8n handed to Meta, and what Meta later said
    -- happened to it (docs/whatsapp-alerts.md, "Free tier"). Meta's 200 only
    -- means "accepted": a free-form text sent outside the 24-hour window is
    -- dropped afterwards (status 'failed', 131047). n8n writes the rows —
    -- the alerts workflow when it sends, n8n/fms-whatsapp-status.json when
    -- Meta reports a status — and resends the failed ones as soon as the
    -- owner messages the business number. Nothing in the backend writes it.
    -- VPS-only: never synced, never in the snapshot (SyncController
    -- PROTECTED_TABLES / VPS_ONLY_TABLES, desktop syncCapture EXCLUDED_TABLES).
    CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
      wamid      text PRIMARY KEY,         -- Meta's message id
      title      text,                     -- first line of the alert
      message    text,                     -- what to resend, as free-form text
      sent_at    timestamptz NOT NULL DEFAULT now(),
      status     text NOT NULL DEFAULT 'accepted', -- accepted | sent | delivered | read | failed
      status_at  timestamptz,
      error      text,                     -- Meta's reason when failed
      resent_at  timestamptz               -- when a failed one was sent again
    );
    CREATE INDEX IF NOT EXISTS whatsapp_messages_to_resend
      ON public.whatsapp_messages (sent_at) WHERE status = 'failed' AND resent_at IS NULL;

  `)
}

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS public.whatsapp_messages;
  `)
}
