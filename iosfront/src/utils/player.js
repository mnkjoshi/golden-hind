// Builds the HTML for the in-WebView HLS player used by Server 1 (LookMovie).
//
// Why a WebView and not react-native-video: this app targets Expo Go, which
// can't load custom native modules. iOS WebView plays HLS natively through
// AVPlayer (hls.js does NOT work on iOS — no MSE in <video>), and that native
// player gives us AirPlay and fullscreen for free. Subtitles ride inside the
// manifest (the server's /proxy/hls-with-subs) so they show in fullscreen too.
//
// The page talks to React Native via window.ReactNativeWebView.postMessage
// (JSON envelopes: meta/time/ended/play/pause/chat/presence/party-status) and
// receives commands by RN injecting `window.gh.seek/play/pause(...)`.
//
// When `party` is provided the page also opens the SSE stream and mirrors the
// web client's sync: apply remote play/pause/seek with an echo guard + settle
// window, and push local play/pause/seek (debounced) back to the room.

export function buildPlayerHtml({ streamUrl, startAt = 0, party = null }) {
  const safeStream = String(streamUrl).replace(/"/g, '&quot;');
  const partyJson = party ? JSON.stringify(party) : 'null';

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<style>
  html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
  #v { width: 100%; height: 100%; background: #000; }
</style>
</head>
<body>
<video id="v" playsinline webkit-playsinline controls autoplay
       x-webkit-airplay="allow" airplay="allow" crossorigin="anonymous"></video>
<script>
(function () {
  var STREAM = "${safeStream}";
  var START_AT = ${Number(startAt) || 0};
  var PARTY = ${partyJson};
  var v = document.getElementById('v');

  function post(o) { try { window.ReactNativeWebView.postMessage(JSON.stringify(o)); } catch (e) {} }

  v.src = STREAM;

  var didResume = false;
  v.addEventListener('loadedmetadata', function () {
    if (!didResume && START_AT > 5 && isFinite(v.duration) && START_AT < v.duration - 2) {
      didResume = true;
      try { v.currentTime = START_AT; } catch (e) {}
    }
    post({ type: 'meta', duration: v.duration || 0 });
  });

  var lastTime = 0;
  v.addEventListener('timeupdate', function () {
    var now = Date.now();
    if (now - lastTime > 4000 && v.currentTime > 1) {
      lastTime = now;
      post({ type: 'time', position: v.currentTime, duration: v.duration || 0 });
    }
  });

  v.addEventListener('ended', function () { post({ type: 'ended' }); });
  v.play().catch(function () {});

  // ── Commands from React Native ──
  window.gh = {
    seek: function (t) { try { v.currentTime = t; } catch (e) {} },
    play: function () { v.play().catch(function () {}); },
    pause: function () { try { v.pause(); } catch (e) {} }
  };

  // ── Watch party sync ──
  if (PARTY && PARTY.roomId) {
    var applyingRemote = false;
    var settleUntil = 0;
    var lastSent = null;
    var pushTimer = null;

    function pushParty() {
      if (!PARTY) return;
      if (applyingRemote || Date.now() < settleUntil) return;
      if (pushTimer) clearTimeout(pushTimer);
      pushTimer = setTimeout(function () {
        if (applyingRemote || Date.now() < settleUntil) return;
        if (!isFinite(v.duration) || v.duration === 0) return;
        var state = { position: v.currentTime || 0, paused: !!v.paused };
        if (lastSent && lastSent.paused === state.paused && Math.abs(lastSent.position - state.position) < 0.8) return;
        lastSent = state;
        fetch(PARTY.api + '/party/update', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user: PARTY.user, token: PARTY.token, roomId: PARTY.roomId, state: state, clientId: PARTY.clientId })
        }).catch(function () {});
      }, 180);
    }

    function applyRemote(s) {
      if (!s) return;
      applyingRemote = true;
      if (!isFinite(v.duration) || v.duration === 0) {
        setTimeout(function () { applyingRemote = false; }, 1200);
        return;
      }
      if (typeof s.position === 'number' && Math.abs(v.currentTime - s.position) > 1.5) {
        try { v.currentTime = s.position; } catch (e) {}
      }
      if (s.paused === true && !v.paused) { try { v.pause(); } catch (e) {} }
      else if (s.paused === false && v.paused) { v.play().catch(function () {}); }
      lastSent = { position: v.currentTime, paused: !!v.paused };
      settleUntil = Date.now() + 1500;
      setTimeout(function () { applyingRemote = false; }, 1500);
    }

    v.addEventListener('play', function () { pushParty(); });
    v.addEventListener('pause', function () { pushParty(); });
    v.addEventListener('seeked', function () { pushParty(); });

    var url = PARTY.api + '/party/stream'
      + '?roomId=' + encodeURIComponent(PARTY.roomId)
      + '&user=' + encodeURIComponent(PARTY.user)
      + '&token=' + encodeURIComponent(PARTY.token)
      + '&clientId=' + encodeURIComponent(PARTY.clientId);
    try {
      var es = new EventSource(url);
      es.onopen = function () { post({ type: 'party-status', status: 'connected' }); };
      es.onerror = function () { post({ type: 'party-status', status: 'error' }); };
      es.onmessage = function (ev) {
        try {
          var s = JSON.parse(ev.data);
          // Forward raw state so RN can react to remote season/episode changes
          // (which require reloading the player with a new stream).
          post({ type: 'party-state', state: s });
          applyRemote(s);
        } catch (e) {}
      };
      es.addEventListener('chat', function (ev) { try { post({ type: 'chat', message: JSON.parse(ev.data) }); } catch (e) {} });
      es.addEventListener('presence', function (ev) { try { post({ type: 'presence', users: JSON.parse(ev.data) }); } catch (e) {} });
      es.addEventListener('reaction', function (ev) { try { post({ type: 'reaction', reaction: JSON.parse(ev.data) }); } catch (e) {} });
      es.addEventListener('end', function () { post({ type: 'party-status', status: 'ended' }); });
    } catch (e) {
      post({ type: 'party-status', status: 'error' });
    }
  }
})();
</script>
</body>
</html>`;
}

export default buildPlayerHtml;
