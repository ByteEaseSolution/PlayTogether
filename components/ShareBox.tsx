'use client';

import { useState } from 'react';

export function ShareBox({ code }: { code: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const guestLink = `${origin}/r/${code}?role=guest`;
  const faceLink = `${origin}/r/${code}?role=face`;

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    setCopied(what);
    setTimeout(() => setCopied(null), 1800);
  };

  return (
    <div className="card">
      <div className="spread">
        <div>
          <div className="tiny dim" style={{ marginBottom: 4 }}>
            ROOM CODE
          </div>
          <div className="code">{code}</div>
        </div>
        <div className="row">
          <button className="small" onClick={() => copy(guestLink, 'her')}>
            {copied === 'her' ? 'Copied' : 'Copy her link'}
          </button>
          <button className="small" onClick={() => copy(faceLink, 'phone')}>
            {copied === 'phone' ? 'Copied' : 'Copy my phone link'}
          </button>
        </div>
      </div>
      <p className="tiny dim" style={{ margin: '12px 0 0', lineHeight: 1.55 }}>
        Open <span className="mono">my phone link</span> on your phone (with earphones in), and send her{' '}
        <span className="mono">her link</span>. Anyone holding a link can join this room, so generate a
        new code when you are done.
      </p>
    </div>
  );
}
