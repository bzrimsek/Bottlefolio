/* An in-memory Firebase, swapped in at the network layer.
 *
 * sync.js routes the page's request for the compat SDK here, so index.html
 * is loaded UNMODIFIED and nothing in it knows the difference. This is a
 * stub, not an assertion: the nine scenarios are the test, and this is only
 * the thing they run against.
 *
 * It exists because the sync CYCLE cannot be staged against a real
 * database. Scenario 1 needs an account deliberately OLDER than the device
 * and scenario 2 needs it newer, which means controlling the stored stamp —
 * and no gate run should ever write to somebody's live shelf or spend a
 * lookup.
 *
 * Rebuilt on 2026-09-08 after the original was lost with its container. It
 * was rebuilt from how sync.js USES it rather than from memory, and then
 * proved: each of the nine fixes was broken in turn to confirm the matching
 * scenario actually goes red. A green harness on a stub nobody proved is
 * worth less than an honest failure — HANDOFF records two earlier attempts
 * that were unknowingly hitting the real server and proved nothing.
 *
 *   window.makeFakeFirebase(seed, opts) -> a firebase-compat shaped object
 *
 * seed: a NESTED object, not slash paths —
 *   { 'bz-apps': { whisky: { testuid: { updated: 1000, bottles: [] } } } }
 * opts: { user: { uid, email } | null }
 *
 * Exposes firebase.__store.data (the tree) and firebase.__store.log (every
 * operation, so a scenario can assert WHAT was written and how much).
 */
(function () {
  'use strict';

  // Firebase does not store undefined, and it drops keys whose value is
  // null. Both matter: the app writes null to DELETE a field, and a
  // scenario that saw a null survive would be testing this file rather than
  // the app.
  function clone(v) {
    if (v === null || v === undefined) return v;
    if (Array.isArray(v)) return v.map(clone);
    if (typeof v === 'object') {
      const o = {};
      Object.keys(v).forEach(k => {
        if (v[k] !== undefined) o[k] = clone(v[k]);
      });
      return o;
    }
    return v;
  }

  function bytesOf(v) {
    try { return JSON.stringify(v === undefined ? null : v).length; }
    catch (e) { return 0; }
  }

  window.makeFakeFirebase = function (seed, opts) {
    const o = opts || {};
    const store = { data: clone(seed) || {}, log: [] };
    // Everything watching, keyed by the path it watches.
    const watchers = [];

    const parts = p => String(p || '').split('/').filter(Boolean);

    function readAt(path) {
      let node = store.data;
      const ps = parts(path);
      for (let i = 0; i < ps.length; i++) {
        if (node === null || typeof node !== 'object') return null;
        node = node[ps[i]];
        if (node === undefined) return null;
      }
      return node === undefined ? null : node;
    }

    function writeAt(path, value) {
      const ps = parts(path);
      if (!ps.length) { store.data = clone(value) || {}; return; }
      let node = store.data;
      for (let i = 0; i < ps.length - 1; i++) {
        if (node[ps[i]] === null || typeof node[ps[i]] !== 'object'
            || Array.isArray(node[ps[i]])) {
          node[ps[i]] = {};
        }
        node = node[ps[i]];
      }
      const last = ps[ps.length - 1];
      // null DELETES, the way the real database does. The app relies on it
      // for tombstones and for clearing a field.
      if (value === null || value === undefined) delete node[last];
      else node[last] = clone(value);
    }

    function fire(path) {
      // A listener hears about its own subtree and about anything above it,
      // which is what the real client does and what the app's live listener
      // depends on.
      watchers.slice().forEach(w => {
        const a = parts(w.path).join('/'), b = parts(path).join('/');
        if (a === b || b.indexOf(a + '/') === 0 || a.indexOf(b + '/') === 0) {
          try { w.cb(snapshot(w.path)); } catch (e) { /* a listener that
            throws must not stop the others */ }
        }
      });
    }

    function snapshot(path) {
      const val = readAt(path);
      const key = parts(path).slice(-1)[0] || null;
      return {
        key: key,
        val: () => clone(val),
        exists: () => val !== null && val !== undefined,
        // forEach walks CHILDREN, and only object children — the app uses
        // it to collect keys off a node.
        forEach: fn => {
          if (!val || typeof val !== 'object' || Array.isArray(val)) return;
          Object.keys(val).forEach(k => {
            fn(snapshot(parts(path).concat([k]).join('/')));
          });
        },
        numChildren: () => (val && typeof val === 'object' && !Array.isArray(val))
          ? Object.keys(val).length : 0
      };
    }

    function ref(path) {
      const self = {
        path: parts(path).join('/'),
        key: parts(path).slice(-1)[0] || null,
        child: c => ref(parts(path).concat(parts(c)).join('/')),
        parent: ref(parts(path).slice(0, -1).join('/')),
        // Queries are shape only: nothing in the app filters server-side,
        // and pretending to would test this file rather than the app.
        orderByChild: () => self,
        equalTo: () => self,
        limitToLast: () => self,

        once: () => {
          store.log.push({ op: 'read', path: self.path });
          return Promise.resolve(snapshot(self.path));
        },
        on: (evt, cb) => {
          watchers.push({ path: self.path, cb: cb });
          // The real client fires once immediately with what is there.
          try { cb(snapshot(self.path)); } catch (e) {}
          return cb;
        },
        off: () => {
          for (let i = watchers.length - 1; i >= 0; i--) {
            if (watchers[i].path === self.path) watchers.splice(i, 1);
          }
        },

        set: v => {
          store.log.push({ op: 'set', path: self.path, bytes: bytesOf(v),
                           keys: (v && typeof v === 'object' && !Array.isArray(v))
                             ? Object.keys(v) : [] });
          writeAt(self.path, v);
          fire(self.path);
          return Promise.resolve();
        },
        remove: () => {
          store.log.push({ op: 'remove', path: self.path, bytes: 0, keys: [] });
          writeAt(self.path, null);
          fire(self.path);
          return Promise.resolve();
        },
        /* A multi-path update. The KEYS are what a scenario asserts on —
           "no bulk key rewritten when nothing in it changed" — so they are
           the top segment of each path, deduped, which is what the app's
           own callers mean by a key. */
        update: patch => {
          const p = patch || {};
          const keys = [];
          Object.keys(p).forEach(k => {
            const top = parts(k)[0];
            if (top && keys.indexOf(top) < 0) keys.push(top);
          });
          store.log.push({ op: 'update', path: self.path,
                           bytes: bytesOf(p), keys: keys });
          Object.keys(p).forEach(k => {
            writeAt(parts(self.path).concat(parts(k)).join('/'), p[k]);
          });
          fire(self.path);
          return Promise.resolve();
        },
        push: v => {
          const id = 'fake' + (store.log.length) + '_'
            + Math.random().toString(36).slice(2, 8);
          const child = ref(parts(self.path).concat([id]).join('/'));
          if (v !== undefined) child.set(v);
          return child;
        },
        transaction: fn => {
          const next = fn(clone(readAt(self.path)));
          if (next !== undefined) {
            writeAt(self.path, next);
            store.log.push({ op: 'set', path: self.path, bytes: bytesOf(next),
                             keys: [] });
            fire(self.path);
          }
          return Promise.resolve({ committed: next !== undefined,
                                   snapshot: snapshot(self.path) });
        },
        onDisconnect: () => ({ remove: () => Promise.resolve(),
                               set: () => Promise.resolve(),
                               cancel: () => Promise.resolve() })
      };
      return self;
    }

    const user = o.user === undefined
      ? { uid: 'testuid', email: 'bz@example.com' } : o.user;

    const auth = {
      currentUser: user,
      onAuthStateChanged: cb => {
        // Asynchronously, like the real one: an app that renders before auth
        // lands is exactly the state several of these scenarios are about.
        setTimeout(() => { try { cb(user); } catch (e) {} }, 0);
        return () => {};
      },
      signInWithPopup: () => Promise.resolve({ user: user }),
      signInWithRedirect: () => Promise.resolve(),
      getRedirectResult: () => Promise.resolve({ user: null }),
      signOut: () => { auth.currentUser = null; return Promise.resolve(); }
    };

    const fb = {
      initializeApp: () => fb,
      app: () => fb,
      apps: [{}],
      auth: Object.assign(() => auth, {
        GoogleAuthProvider: function () { this.addScope = () => {};
                                          this.setCustomParameters = () => {}; }
      }),
      database: () => ({ ref: p => ref(p || ''),
                         goOnline: () => {}, goOffline: () => {} }),
      __store: store
    };
    return fb;
  };
})();
