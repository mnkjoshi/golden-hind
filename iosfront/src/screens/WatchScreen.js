import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Easing,
} from 'react-native';
import { WebView } from 'react-native-webview';
import axios from 'axios';
import { Storage, authenticateUser } from '../utils/storage';
import {
  API_ENDPOINTS, API_BASE_URL, getVideoUrl, VIDEO_PROVIDERS, buildPosKey,
} from '../utils/constants';
import { buildPlayerHtml } from '../utils/player';
import { colors, commonStyles } from '../styles/commonStyles';

// Per-install client id so the party echo filter works (mirrors the web app).
const CLIENT_ID = 'ios-' + Math.random().toString(36).slice(2) + Date.now().toString(36);

const PARTY_EMOJI = ['❤️', '😂', '😮', '😢', '🔥', '👏', '👍', '🎉'];

// A single emoji that floats up over the player and fades out.
function FloatingReaction({ emoji, left }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1, duration: 2400, easing: Easing.out(Easing.quad), useNativeDriver: true,
    }).start();
  }, []);
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -170] });
  const opacity = anim.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 1, 1, 0] });
  return (
    <Animated.Text style={{ position: 'absolute', bottom: 8, left: `${left}%`, fontSize: 32, opacity, transform: [{ translateY }] }}>
      {emoji}
    </Animated.Text>
  );
}

export default function WatchScreen({ navigation, route }) {
  const { id, party: initialParty } = route.params || {};
  const type = id.slice(0, 1) === 'm' ? 'movie' : 'tv';
  const vidID = id.slice(1);

  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState(1);
  const [maxEp, setMaxEp] = useState(1);
  const [maxSe, setMaxSe] = useState(1);
  const [provider, setProvider] = useState(VIDEO_PROVIDERS.LOOKMOVIE);
  const [autoNext, setAutoNext] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [webViewKey, setWebViewKey] = useState(0);

  // Server 1 (LookMovie / HLS) state
  const [lmLoading, setLmLoading] = useState(false);
  const [lmError, setLmError] = useState(null);
  const [streamUrl, setStreamUrl] = useState(null);
  const [resumePos, setResumePos] = useState(0);
  const [playerHtml, setPlayerHtml] = useState(null);

  // Watch party state
  const [partyRoomId, setPartyRoomId] = useState(initialParty || null);
  const [partyStatus, setPartyStatus] = useState(initialParty ? 'connecting' : 'idle');
  const [partyModal, setPartyModal] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [chat, setChat] = useState([]);
  const [presence, setPresence] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [reactions, setReactions] = useState([]); // [{ id, emoji, left }]
  const reactionIdRef = useRef(0);

  const webViewRef = useRef(null);
  const userRef = useRef(null);
  const tokenRef = useRef(null);
  const continueLoggedRef = useRef(false);
  const chatSeenRef = useRef(new Set());
  const seasonRef = useRef(1);
  const episodeRef = useRef(1);
  useEffect(() => { seasonRef.current = season; episodeRef.current = episode; }, [season, episode]);

  useEffect(() => {
    (async () => {
      await authenticateUser(navigation);
      userRef.current = await Storage.getItem('user');
      tokenRef.current = await Storage.getItem('token');
      await loadVideoData();
    })();
  }, []);

  const loadVideoData = async () => {
    const user = userRef.current, token = tokenRef.current;
    try {
      setLoading(true);
      if (type === 'movie') {
        const response = await axios.post(API_ENDPOINTS.MRETRIEVE, { user, token, movie: vidID });
        setData(typeof response.data === 'string' ? JSON.parse(response.data) : response.data);
      } else {
        const response = await axios.post(API_ENDPOINTS.SRETRIEVE, { user, token, series: vidID });
        const seriesData = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
        setData(seriesData);
        if (seriesData.seasons) {
          const regular = seriesData.seasons.filter(s => s.season_number > 0);
          setMaxSe(seriesData.number_of_seasons || regular.length || 1);
          const cur = regular.find(s => s.season_number === 1) || regular[0];
          if (cur?.episode_count) setMaxEp(cur.episode_count);
        }
        // Restore last-watched episode (unless we're joining a party, which drives episode itself)
        if (!initialParty) {
          try {
            const prog = await axios.post(API_ENDPOINTS.PROGRESS_RETRIEVE, { user, token, progID: id });
            if (prog.data && prog.data !== 'VNF' && prog.data.season) {
              setSeason(parseInt(prog.data.season) || 1);
              setEpisode(parseInt(prog.data.episode) || 1);
            }
          } catch {}
        }
      }
      const bookmarks = await Storage.getItem('bookmarks');
      if (bookmarks) {
        try { setBookmarked(JSON.parse(bookmarks).includes(id)); } catch {}
      }
      const an = await Storage.getItem('autoNext');
      setAutoNext(an === '1');
      setLoading(false);
    } catch (error) {
      console.error('Error loading video data:', error);
      setLoading(false);
    }
  };

  // Keep maxEp in sync with the selected season.
  useEffect(() => {
    if (type !== 'tv' || !data.seasons) return;
    const cur = data.seasons.find(s => s.season_number === season);
    if (cur?.episode_count) setMaxEp(cur.episode_count);
  }, [season, data]);

  // ── Server 1: resolve the LookMovie stream + resume position ──
  useEffect(() => {
    if (provider !== VIDEO_PROVIDERS.LOOKMOVIE || loading) return;
    const user = userRef.current, token = tokenRef.current;
    if (!user || !token) return;
    let cancelled = false;

    setLmLoading(true);
    setLmError(null);
    setStreamUrl(null);
    setPlayerHtml(null);

    const posKey = buildPosKey(id, type, season, episode);

    Promise.all([
      axios.post(API_ENDPOINTS.LOOKMOVIE, { user, token, id, season, episode }),
      axios.post(API_ENDPOINTS.POSITION_RETRIEVE, { user, token, posKey }).catch(() => ({ data: null })),
    ]).then(([streamRes, posRes]) => {
      if (cancelled) return;
      if (streamRes.data?.success && streamRes.data.url) {
        const subs = streamRes.data.subtitles || [];
        const url = subs.length > 0
          ? `${API_BASE_URL}/proxy/hls-with-subs?url=${encodeURIComponent(streamRes.data.url)}&subs=${encodeURIComponent(JSON.stringify(subs))}`
          : `${API_BASE_URL}/proxy/hls?url=${encodeURIComponent(streamRes.data.url)}`;
        setResumePos(Number(posRes?.data?.position) || 0);
        setStreamUrl(url);
      } else {
        // Fall back to an embed provider, like the web app does.
        setProvider(VIDEO_PROVIDERS.VIDSRC);
        Alert.alert('Server 1 unavailable', 'Switched to Server 3.');
      }
    }).catch(() => {
      if (cancelled) return;
      setProvider(VIDEO_PROVIDERS.VIDSRC);
      Alert.alert('Server 1 unavailable', 'Switched to Server 3.');
    }).finally(() => { if (!cancelled) setLmLoading(false); });

    return () => { cancelled = true; };
  }, [provider, season, episode, loading]);

  // Build the player HTML whenever the stream, resume point, or party changes.
  // Rebuilding remounts the WebView, which (re)opens the party SSE connection.
  useEffect(() => {
    if (provider !== VIDEO_PROVIDERS.LOOKMOVIE || !streamUrl) return;
    const party = partyRoomId ? {
      roomId: partyRoomId, user: userRef.current, token: tokenRef.current,
      clientId: CLIENT_ID, api: API_BASE_URL,
    } : null;
    setPlayerHtml(buildPlayerHtml({ streamUrl, startAt: resumePos, party }));
    setWebViewKey(k => k + 1);
  }, [streamUrl, resumePos, partyRoomId, provider]);

  // Embed providers (2/3) reload on episode/provider change.
  useEffect(() => {
    if (provider !== VIDEO_PROVIDERS.LOOKMOVIE) setWebViewKey(k => k + 1);
  }, [season, episode, provider]);

  const logContinue = useCallback(async () => {
    if (continueLoggedRef.current) return;
    continueLoggedRef.current = true;
    const user = userRef.current, token = tokenRef.current;
    try {
      await axios.post(API_ENDPOINTS.CONTINUE, { user, token, favId: id });
      if (type === 'tv') {
        await axios.post(API_ENDPOINTS.PROGRESS_UPDATE, { user, token, progID: id, progStatus: `${season};${episode}` });
      }
    } catch {}
  }, [season, episode]);

  const savePosition = useCallback((position, duration) => {
    const user = userRef.current, token = tokenRef.current;
    if (!user || !token || !duration) return;
    const posKey = buildPosKey(id, type, season, episode);
    axios.post(API_ENDPOINTS.POSITION_UPDATE, {
      user, token, posKey, contentId: id, position, duration,
      pct: Math.min(1, Math.max(0, position / duration)),
    }).catch(() => {});
  }, [season, episode]);

  // ── Messages from the player WebView ──
  const onPlayerMessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.nativeEvent.data); } catch { return; }
    switch (msg.type) {
      case 'time':
        logContinue();
        savePosition(msg.position, msg.duration);
        break;
      case 'ended':
        if (autoNext) handleNextEpisode();
        break;
      case 'chat':
        if (msg.message && msg.message.id && !chatSeenRef.current.has(msg.message.id)) {
          chatSeenRef.current.add(msg.message.id);
          setChat(prev => [...prev, msg.message].slice(-200));
        }
        break;
      case 'presence':
        setPresence(msg.users || []);
        break;
      case 'reaction':
        if (msg.reaction && msg.reaction.emoji) spawnReaction(msg.reaction.emoji);
        break;
      case 'party-status':
        setPartyStatus(msg.status === 'ended' ? 'idle' : msg.status);
        if (msg.status === 'ended') leaveParty();
        break;
      case 'party-state':
        // Remote season/episode change → reload with the new episode.
        if (type === 'tv' && msg.state) {
          const s = parseInt(msg.state.season), e = parseInt(msg.state.episode);
          if (s && e && (s !== seasonRef.current || e !== episodeRef.current)) {
            setSeason(s); setEpisode(e);
          }
        }
        break;
      default:
        break;
    }
  };

  const toggleBookmark = async () => {
    const user = userRef.current, token = tokenRef.current;
    try {
      if (bookmarked) {
        await axios.post(API_ENDPOINTS.UNFAVOURITE, { user, token, favId: id });
        setBookmarked(false);
      } else {
        await axios.post(API_ENDPOINTS.FAVOURITE, { user, token, favId: id });
        setBookmarked(true);
      }
    } catch {
      Alert.alert('Error', 'Failed to update favourite');
    }
  };

  // ── Episode navigation ──
  const goToEpisode = (s, e) => {
    setSeason(s);
    setEpisode(e);
    continueLoggedRef.current = false;
    if (partyRoomId) pushEpisodeToParty(s, e);
  };

  const handleNextEpisode = () => {
    if (type !== 'tv') return;
    if (episode < maxEp) goToEpisode(season, episode + 1);
    else if (season < maxSe) goToEpisode(season + 1, 1);
  };
  const handlePreviousEpisode = () => {
    if (type !== 'tv') return;
    if (episode > 1) goToEpisode(season, episode - 1);
    else if (season > 1) {
      const prev = data.seasons?.find(s => s.season_number === season - 1);
      goToEpisode(season - 1, prev?.episode_count || 1);
    }
  };

  const toggleAutoNext = async () => {
    const next = !autoNext;
    setAutoNext(next);
    await Storage.setItem('autoNext', next ? '1' : '0');
  };

  const cycleProvider = () => {
    setProvider(p => (p >= 3 ? 1 : p + 1));
  };

  const downloadTitle = () => {
    const user = userRef.current, token = tokenRef.current;
    // Build the query by hand — RN's URLSearchParams polyfill is incomplete.
    let url = `${API_ENDPOINTS.DOWNLOAD}?user=${encodeURIComponent(user)}&token=${encodeURIComponent(token)}&id=${encodeURIComponent(id)}`;
    if (type === 'tv') url += `&season=${encodeURIComponent(season)}&episode=${encodeURIComponent(episode)}`;
    Linking.openURL(url).catch(() => Alert.alert('Error', 'Could not start download.'));
  };

  // ── Watch party actions ──
  const pushEpisodeToParty = (s, e) => {
    const user = userRef.current, token = tokenRef.current;
    if (!partyRoomId || !user || !token) return;
    axios.post(API_ENDPOINTS.PARTY_UPDATE, {
      user, token, roomId: partyRoomId, clientId: CLIENT_ID,
      state: { position: 0, paused: false, season: parseInt(s) || 1, episode: parseInt(e) || 1 },
    }).catch(() => {});
  };

  const createParty = async () => {
    const user = userRef.current, token = tokenRef.current;
    try {
      const r = await axios.post(API_ENDPOINTS.PARTY_CREATE, { user, token, contentId: id, season, episode });
      if (r.data?.roomId) {
        resetPartyState();
        setPartyRoomId(r.data.roomId);
        setPartyStatus('connecting');
        setPartyModal(false);
      }
    } catch { Alert.alert('Error', 'Could not create party.'); }
  };

  const joinParty = async () => {
    const code = (joinCode || '').trim().toUpperCase();
    if (!/^[A-Z2-9]{6}$/.test(code)) { Alert.alert('Invalid code', 'Codes are 6 letters/digits.'); return; }
    const user = userRef.current, token = tokenRef.current;
    try {
      const r = await axios.post(API_ENDPOINTS.PARTY_INFO, { user, token, roomId: code });
      if (!r.data?.contentId) { Alert.alert('Not found', 'Room not found.'); return; }
      if (r.data.contentId !== id) {
        // Host is watching something else — navigate there with the party code.
        navigation.replace('Watch', { id: r.data.contentId, party: code });
        return;
      }
      resetPartyState();
      setPartyRoomId(code);
      setPartyStatus('connecting');
      setPartyModal(false);
      setJoinCode('');
    } catch { Alert.alert('Error', 'Could not join — bad code or network.'); }
  };

  const resetPartyState = () => {
    setChat([]);
    setPresence([]);
    chatSeenRef.current = new Set();
  };

  const leaveParty = () => {
    setPartyRoomId(null);
    setPartyStatus('idle');
    setShowChat(false);
    setPartyModal(false);
    resetPartyState();
  };

  const sendChat = () => {
    const text = chatInput.trim();
    if (!text || !partyRoomId) return;
    setChatInput('');
    axios.post(API_ENDPOINTS.PARTY_CHAT, {
      user: userRef.current, token: tokenRef.current, roomId: partyRoomId, text,
    }).catch(() => {});
  };

  const spawnReaction = (emoji) => {
    const rid = ++reactionIdRef.current;
    const left = 8 + Math.random() * 80;
    setReactions(prev => [...prev, { id: rid, emoji, left }]);
    setTimeout(() => setReactions(prev => prev.filter(r => r.id !== rid)), 2600);
  };

  // Reactions echo back over SSE, so we rely on the round-trip rather than
  // adding locally (keeps every viewer consistent).
  const sendReaction = (emoji) => {
    if (!partyRoomId) return;
    axios.post(API_ENDPOINTS.PARTY_REACT, {
      user: userRef.current, token: tokenRef.current, roomId: partyRoomId, emoji,
    }).catch(() => {});
  };

  const videoUrl = getVideoUrl(provider, type, vidID, season, episode, autoNext);
  const title = data.title || data.name || 'Loading...';
  const year = data.release_date?.substring(0, 4) || data.first_air_date?.substring(0, 4) || '';
  const rating = data.vote_average ? data.vote_average.toFixed(1) : 'N/A';
  const isLookMovie = provider === VIDEO_PROVIDERS.LOOKMOVIE;

  // Block external redirects/popups for the embed providers.
  const handleShouldStartLoadWithRequest = (request) => {
    const { url } = request;
    if (url.startsWith('about:') || url.startsWith('data:')) return true;
    return url.includes('vidsrc') || url.includes('vidlink') || url.includes('cloudnestra');
  };

  return (
    <View style={commonStyles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        {partyRoomId && (
          <View style={styles.partyPill}>
            <View style={[styles.partyDot, partyStatus === 'connected' && styles.partyDotLive]} />
            <Text style={styles.partyPillText}>Party {partyRoomId}</Text>
            {presence.length > 0 && <Text style={styles.partyPillCount}>· {presence.length}</Text>}
          </View>
        )}
        <TouchableOpacity onPress={toggleBookmark} style={styles.bookmarkButton}>
          <Text style={styles.bookmarkText}>{bookmarked ? '★' : '☆'}</Text>
        </TouchableOpacity>
      </View>

      {/* Video Player */}
      <View style={styles.videoContainer}>
        {isLookMovie ? (
          lmLoading || !playerHtml ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>{lmError || 'Fetching stream…'}</Text>
            </View>
          ) : (
            <WebView
              ref={webViewRef}
              key={webViewKey}
              source={{ html: playerHtml, baseUrl: API_BASE_URL }}
              style={styles.webview}
              allowsFullscreenVideo
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              javaScriptEnabled
              domStorageEnabled
              originWhitelist={['*']}
              onMessage={onPlayerMessage}
            />
          )
        ) : (
          <WebView
            ref={webViewRef}
            key={webViewKey}
            source={{ uri: videoUrl }}
            style={styles.webview}
            allowsFullscreenVideo
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState
            setSupportMultipleWindows={false}
            onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
            originWhitelist={['*']}
            mixedContentMode="always"
            renderLoading={() => (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            )}
          />
        )}

        {/* Floating reactions over the player */}
        {partyRoomId && (
          <View style={styles.reactionLayer} pointerEvents="none">
            {reactions.map(r => (
              <FloatingReaction key={r.id} emoji={r.emoji} left={r.left} />
            ))}
          </View>
        )}
      </View>

      {/* Reaction bar (in a party) */}
      {partyRoomId && (
        <View style={styles.reactionBar}>
          {PARTY_EMOJI.map(e => (
            <TouchableOpacity key={e} style={styles.reactionBtn} onPress={() => sendReaction(e)}>
              <Text style={styles.reactionBtnText}>{e}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Controls */}
      <ScrollView style={styles.controls}>
        <View style={styles.infoSection}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.metadata}>
            {year} • ⭐ {rating} • {type === 'movie' ? 'Movie' : `S${season} · E${episode}`}
          </Text>
          {data.overview ? <Text style={styles.overview}>{data.overview}</Text> : null}
        </View>

        {/* Quick actions */}
        <View style={styles.actionRow}>
          {isLookMovie && (
            <TouchableOpacity style={styles.actionBtn} onPress={downloadTitle}>
              <Text style={styles.actionBtnText}>⬇ Download</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.actionBtn, partyRoomId && styles.actionBtnActive]}
            onPress={() => (partyRoomId ? setShowChat(s => !s) : setPartyModal(true))}
          >
            <Text style={styles.actionBtnText}>{partyRoomId ? '💬 Chat' : '👥 Party'}</Text>
          </TouchableOpacity>
          {partyRoomId && (
            <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDanger]} onPress={leaveParty}>
              <Text style={styles.actionBtnText}>Leave</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* TV Show Controls */}
        {type === 'tv' && (
          <View style={styles.episodeControls}>
            <View style={styles.controlRow}>
              <Text style={styles.controlLabel}>Season {season}</Text>
              <View style={styles.buttonGroup}>
                <TouchableOpacity
                  style={[styles.controlButton, season <= 1 && styles.controlButtonDisabled]}
                  onPress={() => goToEpisode(Math.max(1, season - 1), 1)}
                  disabled={season <= 1}
                ><Text style={styles.controlButtonText}>-</Text></TouchableOpacity>
                <TouchableOpacity
                  style={[styles.controlButton, season >= maxSe && styles.controlButtonDisabled]}
                  onPress={() => goToEpisode(Math.min(maxSe, season + 1), 1)}
                  disabled={season >= maxSe}
                ><Text style={styles.controlButtonText}>+</Text></TouchableOpacity>
              </View>
            </View>
            <View style={styles.controlRow}>
              <Text style={styles.controlLabel}>Episode {episode}</Text>
              <View style={styles.buttonGroup}>
                <TouchableOpacity
                  style={[styles.controlButton, episode <= 1 && styles.controlButtonDisabled]}
                  onPress={() => goToEpisode(season, Math.max(1, episode - 1))}
                  disabled={episode <= 1}
                ><Text style={styles.controlButtonText}>-</Text></TouchableOpacity>
                <TouchableOpacity
                  style={[styles.controlButton, episode >= maxEp && styles.controlButtonDisabled]}
                  onPress={() => goToEpisode(season, Math.min(maxEp, episode + 1))}
                  disabled={episode >= maxEp}
                ><Text style={styles.controlButtonText}>+</Text></TouchableOpacity>
              </View>
            </View>
            <View style={styles.navigationButtons}>
              <TouchableOpacity style={[commonStyles.button, styles.navButton]} onPress={handlePreviousEpisode}>
                <Text style={commonStyles.buttonText}>← Previous</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[commonStyles.button, styles.navButton]} onPress={handleNextEpisode}>
                <Text style={commonStyles.buttonText}>Next →</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Provider Selection */}
        <View style={styles.providerSection}>
          <Text style={styles.sectionTitle}>Server</Text>
          <View style={styles.providerButtons}>
            {[
              { p: VIDEO_PROVIDERS.LOOKMOVIE, label: 'Server 1' },
              { p: VIDEO_PROVIDERS.VIDLINK, label: 'Server 2' },
              { p: VIDEO_PROVIDERS.VIDSRC, label: 'Server 3' },
            ].map(({ p, label }) => (
              <TouchableOpacity
                key={p}
                style={[styles.providerButton, provider === p && styles.providerButtonActive]}
                onPress={() => setProvider(p)}
              >
                <Text style={styles.providerButtonText}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {isLookMovie && <Text style={styles.providerHint}>Server 1 supports AirPlay, subtitles, resume & downloads.</Text>}
        </View>

        {/* Auto Next (TV only) */}
        {type === 'tv' && (
          <TouchableOpacity style={styles.toggleRow} onPress={toggleAutoNext}>
            <Text style={styles.toggleText}>Auto Play Next Episode</Text>
            <View style={[styles.toggle, autoNext && styles.toggleActive]}>
              <View style={[styles.toggleThumb, autoNext && styles.toggleThumbActive]} />
            </View>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Party chat overlay */}
      {partyRoomId && showChat && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.chatPanel}
        >
          <View style={styles.chatHeader}>
            <Text style={styles.chatTitle}>Party Chat{presence.length ? ` · ${presence.length} here` : ''}</Text>
            <TouchableOpacity onPress={() => setShowChat(false)}><Text style={styles.chatClose}>✕</Text></TouchableOpacity>
          </View>
          <FlatList
            style={styles.chatList}
            data={chat}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => {
              const mine = item.user === userRef.current;
              return (
                <View style={[styles.chatMsg, mine && styles.chatMsgMine]}>
                  {!mine && <Text style={styles.chatUser}>{item.user}</Text>}
                  <Text style={[styles.chatText, mine && styles.chatTextMine]}>{item.text}</Text>
                </View>
              );
            }}
            ListEmptyComponent={<Text style={styles.chatEmpty}>No messages yet — say hi 👋</Text>}
          />
          <View style={styles.chatInputRow}>
            <TextInput
              style={styles.chatInput}
              placeholder="Message…"
              placeholderTextColor={colors.textSecondary}
              value={chatInput}
              onChangeText={setChatInput}
              onSubmitEditing={sendChat}
              maxLength={500}
              returnKeyType="send"
            />
            <TouchableOpacity style={styles.chatSend} onPress={sendChat}><Text style={styles.chatSendText}>Send</Text></TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* Party create/join modal */}
      <Modal visible={partyModal} transparent animationType="fade" onRequestClose={() => setPartyModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Watch Party</Text>
            <Text style={styles.modalSub}>Watch in sync with friends — playback and chat stay together.</Text>
            <TouchableOpacity style={[commonStyles.button, styles.modalBtn]} onPress={createParty}>
              <Text style={commonStyles.buttonText}>Create party for this title</Text>
            </TouchableOpacity>
            <Text style={styles.modalOr}>or join</Text>
            <View style={styles.joinRow}>
              <TextInput
                style={styles.joinInput}
                placeholder="Room code"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="characters"
                value={joinCode}
                onChangeText={(t) => setJoinCode(t.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6))}
                maxLength={6}
              />
              <TouchableOpacity style={[commonStyles.button, styles.joinBtn]} onPress={joinParty}>
                <Text style={commonStyles.buttonText}>Join</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => setPartyModal(false)} style={styles.modalCancel}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 50, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backButton: { padding: 8 },
  backText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
  bookmarkButton: { padding: 8 },
  bookmarkText: { fontSize: 24, color: colors.primary },
  partyPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.cardBg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: colors.primary,
  },
  partyDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.warning },
  partyDotLive: { backgroundColor: colors.success },
  partyPillText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  partyPillCount: { color: colors.textSecondary, fontSize: 12 },
  videoContainer: { width: '100%', height: 250, backgroundColor: '#000' },
  reactionLayer: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  reactionBar: {
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
    paddingVertical: 8, paddingHorizontal: 6, backgroundColor: colors.cardBg,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  reactionBtn: { padding: 4 },
  reactionBtnText: { fontSize: 24 },
  webview: { flex: 1, backgroundColor: '#000' },
  loadingContainer: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center', backgroundColor: '#000',
  },
  loadingText: { color: colors.textSecondary, marginTop: 12, fontSize: 13 },
  controls: { flex: 1 },
  infoSection: { padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontSize: 22, fontWeight: 'bold', color: colors.text, marginBottom: 8 },
  metadata: { fontSize: 14, color: colors.textSecondary, marginBottom: 12 },
  overview: { fontSize: 14, color: colors.text, lineHeight: 20 },
  actionRow: { flexDirection: 'row', gap: 10, padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  actionBtn: {
    flex: 1, backgroundColor: colors.cardBg, paddingVertical: 12, borderRadius: 8,
    alignItems: 'center', borderWidth: 1, borderColor: colors.border,
  },
  actionBtnActive: { borderColor: colors.primary, backgroundColor: colors.primary + '20' },
  actionBtnDanger: { borderColor: colors.error, backgroundColor: colors.error + '18', flex: 0.6 },
  actionBtnText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  episodeControls: { padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  controlRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  controlLabel: { fontSize: 16, color: colors.text, fontWeight: '600' },
  buttonGroup: { flexDirection: 'row', gap: 8 },
  controlButton: { backgroundColor: colors.primary, width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  controlButtonDisabled: { backgroundColor: colors.cardBg, opacity: 0.5 },
  controlButtonText: { color: colors.text, fontSize: 20, fontWeight: 'bold' },
  navigationButtons: { flexDirection: 'row', gap: 12, marginTop: 12 },
  navButton: { flex: 1 },
  providerSection: { padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 12 },
  providerButtons: { flexDirection: 'row', gap: 8 },
  providerButton: { flex: 1, backgroundColor: colors.cardBg, paddingVertical: 12, borderRadius: 8, alignItems: 'center', borderWidth: 2, borderColor: colors.border },
  providerButtonActive: { borderColor: colors.primary, backgroundColor: colors.primary + '20' },
  providerButtonText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  providerHint: { color: colors.textSecondary, fontSize: 12, marginTop: 10 },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  toggleText: { fontSize: 16, color: colors.text, fontWeight: '600' },
  toggle: { width: 50, height: 28, borderRadius: 14, backgroundColor: colors.cardBg, padding: 2, justifyContent: 'center' },
  toggleActive: { backgroundColor: colors.primary },
  toggleThumb: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.text },
  toggleThumbActive: { alignSelf: 'flex-end' },
  // Chat panel
  chatPanel: {
    position: 'absolute', right: 12, bottom: 12, width: 300, height: 380,
    backgroundColor: colors.cardBg, borderRadius: 16, borderWidth: 1, borderColor: colors.primary,
    overflow: 'hidden',
  },
  chatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  chatTitle: { color: colors.text, fontWeight: '600', fontSize: 14 },
  chatClose: { color: colors.textSecondary, fontSize: 16 },
  chatList: { flex: 1, paddingHorizontal: 12 },
  chatMsg: { marginVertical: 4, maxWidth: '85%', alignSelf: 'flex-start' },
  chatMsgMine: { alignSelf: 'flex-end' },
  chatUser: { color: colors.secondary, fontSize: 11, fontWeight: '600', marginBottom: 2 },
  chatText: { backgroundColor: colors.background, color: colors.text, borderRadius: 12, paddingVertical: 7, paddingHorizontal: 11, fontSize: 13, overflow: 'hidden' },
  chatTextMine: { backgroundColor: colors.primary, color: '#07101f' },
  chatEmpty: { color: colors.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 24 },
  chatInputRow: { flexDirection: 'row', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: colors.border },
  chatInput: { flex: 1, backgroundColor: colors.background, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, color: colors.text, fontSize: 13 },
  chatSend: { backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 16, justifyContent: 'center' },
  chatSendText: { color: '#07101f', fontWeight: '600', fontSize: 13 },
  // Party modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalBox: { width: '100%', backgroundColor: colors.cardBg, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: colors.border },
  modalTitle: { color: colors.text, fontSize: 20, fontWeight: 'bold', marginBottom: 6 },
  modalSub: { color: colors.textSecondary, fontSize: 14, marginBottom: 16 },
  modalBtn: { marginBottom: 14 },
  modalOr: { color: colors.textSecondary, textAlign: 'center', marginBottom: 12 },
  joinRow: { flexDirection: 'row', gap: 8 },
  joinInput: { flex: 1, backgroundColor: colors.background, borderRadius: 8, paddingHorizontal: 14, color: colors.text, fontSize: 16, letterSpacing: 2, borderWidth: 1, borderColor: colors.border },
  joinBtn: { paddingHorizontal: 20 },
  modalCancel: { marginTop: 16, alignItems: 'center' },
  modalCancelText: { color: colors.textSecondary, fontSize: 14 },
});
