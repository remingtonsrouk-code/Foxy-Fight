/* Foxy Fight — client-to-client connection for Versus.
 * A thin wrapper over PeerJS (WebRTC data channels). The two browsers talk
 * directly; PeerJS's free public broker is only used to introduce them.
 * For testing or private use, ?peerhost=host:port points at your own PeerJS
 * server instead (add &peersecure=0 for plain http). */
(function (root) {
  'use strict';
  const CB = root.CB = root.CB || {};
  const PREFIX = 'foxyfight-';
  const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L

  function PeerCtor() { return root.Peer || (root.peerjs && root.peerjs.Peer) || null; }

  function peerOptions() {
    let q;
    try { q = new URLSearchParams(root.location.search); } catch (e) { q = new URLSearchParams(''); }
    const h = q.get('peerhost');
    if (!h) return { debug: 0 };
    const [host, port] = h.split(':');
    const local = host === 'localhost' || host === '127.0.0.1';
    return { host, port: Number(port) || (local ? 9000 : 443), path: q.get('peerpath') || '/', secure: q.get('peersecure') === '1' || (!local && q.get('peersecure') !== '0'), debug: 0 };
  }

  function makeCode() {
    let s = '';
    const buf = new Uint32Array(6);
    (root.crypto || {}).getRandomValues ? root.crypto.getRandomValues(buf) : buf.forEach((_, i) => { buf[i] = Math.random() * 1e9; });
    for (let i = 0; i < 6; i++) s += ALPHABET[buf[i] % ALPHABET.length];
    return s;
  }
  function cleanCode(input) {
    const s = String(input || '').trim();
    const m = s.match(/[?&]join=([A-Za-z0-9]+)/);
    return (m ? m[1] : s).toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function friendlyError(err) {
    const t = err && err.type;
    if (t === 'peer-unavailable') return 'No ring is open with that code. Check the code, and that your opponent is still waiting.';
    if (t === 'unavailable-id') return 'That ring code is already in use.';
    if (t === 'browser-incompatible') return 'This browser cannot make direct connections. Try a current Chrome, Edge, Firefox or Safari.';
    if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed')
      return "Couldn't reach the connection service. Check your internet connection. The copy of the game hosted inside Claude can't make outside connections, so online Versus needs the downloaded or self-hosted copy.";
    return (err && err.message) || 'The connection failed.';
  }

  class Link {
    constructor() { this.handlers = {}; this.peer = null; this.conn = null; this.code = ''; this.role = ''; this.closed = false; this.retry = null; }
    on(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); return this; }
    emit(ev, data) { (this.handlers[ev] || []).forEach(fn => { try { fn(data); } catch (e) { console.error(e); } }); }

    _peer(id) {
      const P = PeerCtor();
      if (!P) throw Object.assign(new Error('Online play is not available in this copy of the game.'), { type: 'browser-incompatible' });
      const peer = id ? new P(id, peerOptions()) : new P(peerOptions());
      peer.on('error', err => this.emit('error', err));
      peer.on('disconnected', () => { if (!this.closed && !peer.destroyed) { try { peer.reconnect(); } catch (e) { /* ignore */ } } });
      return peer;
    }

    host(code) {
      this.role = 'host'; this.code = code;
      this.peer = this._peer(PREFIX + code);
      this.peer.on('open', () => this.emit('ready', code));
      this.peer.on('connection', conn => this._attach(conn));
    }

    join(code) {
      this.role = 'guest'; this.code = code;
      this.peer = this._peer(null);
      this.peer.on('open', () => this.connect());
    }

    connect() {
      if (this.closed || !this.peer || this.peer.destroyed) return;
      const conn = this.peer.connect(PREFIX + this.code, { reliable: true, serialization: 'json' });
      this._attach(conn);
    }

    /* Guest only: keep trying to reach the host after a drop. */
    reconnectLoop() {
      if (this.role !== 'guest' || this.retry) return;
      this.retry = setInterval(() => {
        if (this.closed) { clearInterval(this.retry); this.retry = null; return; }
        if (this.open) { clearInterval(this.retry); this.retry = null; return; }
        if (this.peer && this.peer.disconnected && !this.peer.destroyed) { try { this.peer.reconnect(); } catch (e) { /* ignore */ } }
        if (this.peer && this.peer.open) this.connect();
      }, 3000);
    }

    _attach(conn) {
      const prev = this.conn;
      this.conn = conn;
      conn.on('open', () => {
        if (prev && prev !== conn) { try { prev.close(); } catch (e) { /* ignore */ } }
        this.emit('open');
      });
      conn.on('data', data => { if (this.conn === conn) this.emit('message', data); });
      conn.on('close', () => { if (this.conn === conn && !this.closed) this.emit('close'); });
      conn.on('error', err => this.emit('error', err));
    }

    get open() { return !!(this.conn && this.conn.open); }

    send(msg) {
      if (!this.open) return false;
      try { this.conn.send(msg); return true; } catch (e) { return false; }
    }

    destroy() {
      this.closed = true;
      if (this.retry) { clearInterval(this.retry); this.retry = null; }
      try { if (this.conn) this.conn.close(); } catch (e) { /* ignore */ }
      try { if (this.peer) this.peer.destroy(); } catch (e) { /* ignore */ }
    }
  }

  CB.Net = { available: () => !!PeerCtor() && typeof root.RTCPeerConnection !== 'undefined', makeCode, cleanCode, friendlyError, Link, PREFIX };
})(typeof self !== 'undefined' ? self : this);
