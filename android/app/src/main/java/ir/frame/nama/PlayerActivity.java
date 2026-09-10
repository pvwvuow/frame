package ir.frame.nama;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.GestureDetector;
import android.view.HapticFeedbackConstants;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.PopupMenu;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.OptIn;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.PlaybackParameters;
import androidx.media3.common.Player;
import androidx.media3.common.TrackGroup;
import androidx.media3.common.TrackSelectionOverride;
import androidx.media3.common.TrackSelectionParameters;
import androidx.media3.common.Tracks;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.okhttp.OkHttpDataSource;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector;
import androidx.media3.ui.AspectRatioFrameLayout;
import androidx.media3.ui.PlayerView;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * v0.12.0 — native fullscreen player.
 *
 * The Android WebView cannot demux Matroska: most of the catalog's videos
 * are MKV (every SoftSub release) and simply never played in the responsive
 * web player. ExoPlayer/Media3 plays MKV (+ HEVC when the device has the
 * decoder) and renders the Persian SRT muxed INSIDE the container.
 *
 * v0.17.0 — FEATURE PARITY WITH THE MOBILE PLAYER. The controller used to be
 * the bare ExoPlayer default — none of the PlayerMobile feature set existed
 * natively. This rewrite adds the custom Netflix-style surface:
 *   - tap = controls, double-tap sides = ±10s with ripple + haptic
 *   - drag scrub with time preview + buffered bar
 *   - speed menu (0.5×–2×), embedded subtitle/audio track picker
 *   - screen lock (long-press the chip to unlock), Persian digits everywhere
 *
 * v0.18.0 — CLOSING THE GAP WITH THE WEB PLAYER:
 *   - episodes sheet from the JS manifest (seasons, watched ticks, progress)
 *     + prev/next episode → result extra switchToEpisodeId
 *   - honest cinema entry: «سوییچ به نسخه وب‌سازگار» → switchToWeb
 *   - zoom cycle (fit/fill/stretch), speed 0.25×–3×, sleep timer (with
 *     end-of-episode mode), double-tap step from JS, MediaSession artwork
 *
 * TLS note (v0.17.0): trust-all certificate validation is now scoped to the
 * archive's dl hosts ONLY (RELAXED_TLS_HOSTS); every other host gets standard
 * strict TLS. Desktop parity (rejectUnauthorized:false) is kept for those
 * broken-cert dl hosts.
 *
 * Result contract (back to the JS player through NamaNativePlugin):
 * positionMs / durationMs / ended / error.
 */
@OptIn(markerClass = UnstableApi.class)
public class PlayerActivity extends Activity {

    /** The ONE host family the catalog streams from (dls..dls9 subdomains).
     *  These keep the desktop-parity relaxed TLS; all other hosts are strict. */
    private static final Set<String> RELAXED_TLS_HOSTS = new HashSet<>(
        Arrays.asList("aparatchi-dlcenter.top"));

    private static boolean relaxedHost(String host) {
        if (host == null) return false;
        for (String h : RELAXED_TLS_HOSTS) {
            if (host.equals(h) || host.endsWith("." + h)) return true;
        }
        return false;
    }

    private ExoPlayer player;
    private PlayerView playerView;
    private final Handler tick = new Handler(Looper.getMainLooper());

    // custom controller views
    private View topBar, bottomBar, gestureSurface, lockChip;
    private FrameLayout rippleHost;
    private ImageButton btnPlayPause;
    private TextView tvTitle, tvSubtitle, tvPosition, tvDuration, tvPreview;
    private TextView tvSleep;
    private SeekBar seek;
    private boolean controlsVisible = true;
    private boolean locked = false;
    private boolean dragging = false;

    // v0.18.0 — episodes manifest, switch contract, zoom + sleep state
    private int[] epIds, epSeasons, epNums, epPcts;
    private String[] epNames;
    private boolean[] epWatched;
    private int epIndex = 0;
    private boolean hasWebVariant = false;
    private long seekStepMs = 10_000L;
    private int sleepLeftSec = -1; // -1 = off
    private boolean sleepEndOfEpisode = false;
    private int resizeModeIdx = 0;
    private androidx.media3.session.MediaSession mediaSession;
    private static final int[] RESIZE_MODES = {
        AspectRatioFrameLayout.RESIZE_MODE_FIT,
        AspectRatioFrameLayout.RESIZE_MODE_ZOOM,
        AspectRatioFrameLayout.RESIZE_MODE_FILL,
    };
    private static final String[] RESIZE_LABELS = {"اندازه", "پرکردن", "کشیده"};
    private final Runnable hideRunnable = this::hideControls;
    private final Runnable uiRunnable = new Runnable() {
        @Override
        public void run() {
            updateUi();
            tick.postDelayed(this, 500L);
        }
    };

    /** polled by JS through the plugin while the activity is up */
    private static volatile long sPositionMs = 0L;
    private static volatile long sDurationMs = 0L;
    private static volatile boolean sEnded = false;
    private static volatile String sError = "";

    public static long peekPositionMs() { return sPositionMs; }
    public static long peekDurationMs() { return sDurationMs; }
    public static boolean peekEnded() { return sEnded; }
    public static String peekError() { return sError; }

    private final Runnable tickRunner = new Runnable() {
        @Override
        public void run() {
            if (player != null) {
                sPositionMs = Math.max(0L, player.getCurrentPosition());
                long d = player.getDuration();
                if (d > 0) sDurationMs = d;
            }
            tickSleep(); // v0.18.0 — sleep timer countdown
            tick.postDelayed(this, 1000L);
        }
    };

    /* ---------------- Persian digits + time ---------------- */

    private static String fa(String s) {
        String r = s;
        for (int i = 0; i < 10; i++) r = r.replace((char) ('0' + i), (char) ('۰' + i));
        return r;
    }

    private static String clock(long sec) {
        if (sec < 0) sec = 0;
        long h = sec / 3600, m = (sec % 3600) / 60, s = sec % 60;
        return fa(h > 0
            ? String.format("%d:%02d:%02d", h, m, s)
            : String.format("%d:%02d", m, s));
    }

    @OptIn(markerClass = UnstableApi.class)
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat insets =
            new WindowInsetsControllerCompat(getWindow(), getWindow().getDecorView());
        insets.hide(WindowInsetsCompat.Type.systemBars());
        insets.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        setContentView(R.layout.activity_player);
        playerView = (PlayerView) findViewById(R.id.player_view);

        String url = getIntent().getStringExtra("url");
        String title = getIntent().getStringExtra("title");
        String subtitle = getIntent().getStringExtra("subtitle");
        long startMs = getIntent().getLongExtra("positionMs", 0L);
        String[] subs = getIntent().getStringArrayExtra("subs");

        // v0.18.0 — episodes manifest / poster / seek step / web-variant flag
        seekStepMs = 1000L * getIntent().getIntExtra("seekStepSec", 10);
        if (seekStepMs <= 0) seekStepMs = 10_000L;
        hasWebVariant = getIntent().getBooleanExtra("hasWebVariant", false);
        String poster = getIntent().getStringExtra("poster");
        String[] eps = getIntent().getStringArrayExtra("episodes");
        if (eps != null && eps.length > 0) {
            int n = eps.length;
            epIds = new int[n];
            epSeasons = new int[n];
            epNums = new int[n];
            epNames = new String[n];
            epWatched = new boolean[n];
            epPcts = new int[n];
            for (int i = 0; i < n; i++) {
                String[] p = eps[i].split("\u0001", -1);
                try {
                    epIds[i] = Integer.parseInt(p[0]);
                    epSeasons[i] = p.length > 1 ? Integer.parseInt(p[1]) : 0;
                    epNums[i] = p.length > 2 ? Integer.parseInt(p[2]) : 0;
                    epNames[i] = p.length > 3 ? p[3] : "";
                    epWatched[i] = p.length > 5 && "1".equals(p[5]);
                    epPcts[i] = p.length > 6 ? Integer.parseInt(p[6]) : 0;
                } catch (NumberFormatException e) {
                    epIds[i] = 0;
                }
            }
            epIndex = Math.max(0, Math.min(n - 1, getIntent().getIntExtra("episodeIndex", 0)));
        }

        sEnded = false;
        sError = "";

        // v0.19.0 — CRASH SHIELD: any exception during player construction
        // (TLS init, codec/OEM quirks, Media3 internals) used to propagate
        // out of onCreate and kill the WHOLE app. It degrades to an honest
        // «error» result instead — JS ladders to the next variant, the user
        // just sees the player close. Everything below only touches locals
        // and the (nullable) player/mediaSession fields, so the catch is safe.
        try {
        DefaultRenderersFactory renderers =
            new DefaultRenderersFactory(this)
                .setEnableDecoderFallback(true)
                .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_OFF);

        // v0.16.1 — desktop-parity network behavior (UA, redirects, timeouts).
        // v0.17.0 — the trust-all TLS is SCOPED: only the archive's dl hosts
        // keep the relaxed sockets; everything else verifies certificates
        // normally (Supabase/GitHub traffic never had any reason to be here,
        // and global trust-all was a Play-Protect red-block signal).
        String DESKTOP_UA =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
                + "Chrome/126.0 Safari/537.36";
        okhttp3.OkHttpClient.Builder hb = new okhttp3.OkHttpClient.Builder()
            .connectTimeout(15, java.util.concurrent.TimeUnit.SECONDS)
            .readTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
            .retryOnConnectionFailure(true); // followRedirects + followSslRedirects (http⇄https) default ON
        if (relaxedHost(Uri.parse(url).getHost())) {
            final javax.net.ssl.X509TrustManager trustAll =
                new javax.net.ssl.X509TrustManager() {
                    @Override
                    public void checkClientTrusted(java.security.cert.X509Certificate[] chain, String authType) {
                    }

                    @Override
                    public void checkServerTrusted(java.security.cert.X509Certificate[] chain, String authType) {
                    }

                    @Override
                    public java.security.cert.X509Certificate[] getAcceptedIssuers() {
                        return new java.security.cert.X509Certificate[0];
                    }
                };
            javax.net.ssl.SSLContext sslContext;
            try {
                sslContext = javax.net.ssl.SSLContext.getInstance("TLS");
                sslContext.init(null, new javax.net.ssl.TrustManager[] { trustAll }, new java.security.SecureRandom());
            } catch (Exception e) {
                throw new IllegalStateException("TLS init failed", e);
            }
            hb.sslSocketFactory(sslContext.getSocketFactory(), trustAll)
                .hostnameVerifier((hostname, session) -> true);
        }
        okhttp3.OkHttpClient httpClient = hb.build();

        OkHttpDataSource.Factory http = new OkHttpDataSource.Factory(httpClient)
            .setUserAgent(DESKTOP_UA);

        DefaultTrackSelector selector = new DefaultTrackSelector(this);
        selector.setParameters(
            selector.buildUponParameters()
                .setPreferredTextLanguages("fa", "per", "fas")
                .setSelectUndeterminedTextLanguage(true)
                .build());

        player = new ExoPlayer.Builder(this, renderers)
            .setMediaSourceFactory(new DefaultMediaSourceFactory(http))
            .setTrackSelector(selector)
            .build();
        player.setAudioAttributes(
            new AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
                .build(),
            true);

        playerView.setPlayer(player);

        MediaItem.Builder builder = new MediaItem.Builder().setUri(Uri.parse(url));
        MediaMetadata.Builder metaBuilder = new MediaMetadata.Builder()
            .setTitle(title == null ? "Frame" : title)
            .setArtist(subtitle == null ? "" : subtitle);
        // v0.18.0 — the poster rides into the lockscreen/media surfaces
        if (poster != null && !poster.isEmpty()) {
            try {
                metaBuilder.setArtworkUri(Uri.parse(poster));
            } catch (Exception ignored) {
            }
        }
        builder.setMediaMetadata(metaBuilder.build());

        // external (user-uploaded) subtitles: entries are "path\u0001mime"
        if (subs != null && subs.length > 0) {
            java.util.ArrayList<MediaItem.SubtitleConfiguration> cfgs =
                new java.util.ArrayList<>();
            for (String raw : subs) {
                if (raw == null) continue;
                int sep = raw.indexOf('\u0001');
                String path = sep >= 0 ? raw.substring(0, sep) : raw;
                String mime = sep >= 0 ? raw.substring(sep + 1) : MimeTypes.APPLICATION_SUBRIP;
                try {
                    Uri u = path.startsWith("http") || path.startsWith("content")
                        ? Uri.parse(path)
                        : androidx.core.content.FileProvider.getUriForFile(
                            this, getPackageName() + ".fileprovider", new java.io.File(path));
                    cfgs.add(
                        new MediaItem.SubtitleConfiguration.Builder(u)
                            .setMimeType(mime)
                            .setLanguage("fa")
                            .setSelectionFlags(C.SELECTION_FLAG_DEFAULT)
                            .build());
                } catch (Exception ignored) {
                }
            }
            if (!cfgs.isEmpty()) builder.setSubtitleConfigurations(cfgs);
        }

        player.setMediaItem(builder.build());
        if (startMs > 0) player.seekTo(startMs);
        player.setPlayWhenReady(true);
        player.prepare();

        // v0.18.0 — MediaSession: hardware media buttons + lockscreen controls
        try {
            mediaSession = new androidx.media3.session.MediaSession.Builder(this, player).build();
        } catch (Exception ignored) {
            // session module unavailable — playback itself is unaffected
        }

        player.addListener(new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_ENDED) {
                    sEnded = true;
                    if (player != null) {
                        sPositionMs = Math.max(0L, player.getDuration());
                        sDurationMs = Math.max(0L, player.getDuration());
                    }
                    tick.postDelayed(() -> finish(), 400L);
                }
            }

            @Override
            public void onIsPlayingChanged(boolean isPlaying) {
                updatePlayPauseIcon();
            }

            @Override
            public void onPlayerError(PlaybackException error) {
                // v0.16.3 — surface the precise code name to JS (was: only
                // getMessage(), which made every failure look the same)
                String codeName = error.getErrorCodeName() == null
                    ? ("code " + error.errorCode)
                    : error.getErrorCodeName();
                sError = codeName + ": "
                    + (error.getMessage() == null ? "playback-error" : error.getMessage());

                // v0.16.3 — an undecodable AUDIO track (AC3/E-AC3/DTS on
                // devices without the codec) must not kill playback.
                // v0.21.1 — HARDENING: the old handler muted the WHOLE audio
                // track on the FIRST codec failure — even video-side ones —
                // and never tried the file's OTHER audio tracks. Now, driven
                // by bounded error repetition (media3 1.4.1 exposes no
                // track-type on ExoPlaybackException — the failed CI run
                // proved getMediaTrackType() does not exist, so NO API guess):
                //   1. every UNTRIED audio group gets one prepare (multi-audio
                //      MKVs: main AAC + commentary DTS…, capped at 3 alternates)
                //   2. then mute once (the old behavior, now the LAST resort)
                //   3. then finish → the JS ladder owns the variant
                boolean codecFailure =
                    error.errorCode == PlaybackException.ERROR_CODE_DECODER_INIT_FAILED
                        || error.errorCode == PlaybackException.ERROR_CODE_DECODING_FAILED;
                if (codecFailure && player != null) {
                    if (!audioDropped && audioAltTries < MAX_AUDIO_ALTS && tryNextAudioTrack()) {
                        audioAltTries++;
                        return;
                    }

                    if (!audioDropped) {
                        audioDropped = true;
                        Toast.makeText(PlayerActivity.this,
                            "صدای این نسخه پشتیبانی نمی‌شود — پخش بی‌صدا ادامه می‌یابد",
                            Toast.LENGTH_LONG).show();
                        player.setTrackSelectionParameters(
                            player.getTrackSelectionParameters().buildUpon()
                                .setTrackTypeDisabled(C.TRACK_TYPE_AUDIO, true)
                                .build());
                        player.prepare();
                        player.setPlayWhenReady(true);
                        return;
                    }
                }

                Toast.makeText(PlayerActivity.this,
                    "پخش این نسخه ممکن نشد", Toast.LENGTH_LONG).show();
                tick.postDelayed(() -> finish(), 600L);
            }
        });
        } catch (Exception e) {
            sError = "setup-failed: " + e.getClass().getSimpleName()
                + (e.getMessage() == null ? "" : (": " + e.getMessage()));
            tick.postDelayed(() -> finish(), 250L);
            return;
        }

        tick.post(tickRunner);
        tick.post(uiRunnable);

        bindController();
    }

    /* ================= custom controller (v0.17.0) ================= */

    private void bindController() {
        topBar = findViewById(R.id.top_bar);
        bottomBar = findViewById(R.id.bottom_bar);
        gestureSurface = findViewById(R.id.gesture_surface);
        rippleHost = (FrameLayout) findViewById(R.id.ripple_host);
        lockChip = findViewById(R.id.lock_chip);
        btnPlayPause = (ImageButton) findViewById(R.id.btn_play_pause);
        tvTitle = (TextView) findViewById(R.id.tv_title);
        tvSubtitle = (TextView) findViewById(R.id.tv_subtitle);
        tvPosition = (TextView) findViewById(R.id.tv_position);
        tvDuration = (TextView) findViewById(R.id.tv_duration);
        tvPreview = (TextView) findViewById(R.id.tv_preview);
        seek = (SeekBar) findViewById(R.id.seek);

        tvTitle.setText(getIntent().getStringExtra("title"));
        String sub = getIntent().getStringExtra("subtitle");
        tvSubtitle.setText(sub == null || sub.isEmpty() ? "پخش با پلیر دستگاه — زیرنویس و کیفیت از نوار پایین" : sub);

        findViewById(R.id.btn_back).setOnClickListener(v -> finish());

        btnPlayPause.setOnClickListener(v -> {
            togglePlayPause();
            bumpUi();
        });

        findViewById(R.id.btn_rewind).setOnClickListener(v -> {
            seekBy(-10_000L);
            bumpUi();
        });
        findViewById(R.id.btn_forward).setOnClickListener(v -> {
            seekBy(10_000L);
            bumpUi();
        });

        // tap = controls, double-tap sides = ±10s (physical: left=back)
        final GestureDetector detector = new GestureDetector(this,
            new GestureDetector.SimpleOnGestureListener() {
                @Override
                public boolean onDown(MotionEvent e) {
                    return true;
                }

                @Override
                public boolean onSingleTapConfirmed(MotionEvent e) {
                    if (locked) {
                        flashLockChip();
                        return true;
                    }
                    if (controlsVisible) hideControls();
                    else showControls();
                    return true;
                }

                @Override
                public boolean onDoubleTap(MotionEvent e) {
                    if (locked) {
                        flashLockChip();
                        return true;
                    }
                    boolean forward = e.getX() > gestureSurface.getWidth() / 2f;
                    showRipple(forward);
                    seekBy(forward ? seekStepMs : -seekStepMs); // v0.18.0 — step from JS
                    return true;
                }
            });
        gestureSurface.setOnTouchListener((v, ev) -> {
            detector.onTouchEvent(ev);
            return true;
        });

        // drag scrub with preview
        seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar bar, int progress, boolean fromUser) {
                if (!fromUser || player == null) return;
                long d = player.getDuration();
                if (d <= 0) return;
                tvPreview.setText(clock(progress * d / 1000L));
            }

            @Override
            public void onStartTrackingTouch(SeekBar bar) {
                dragging = true;
                tvPreview.setVisibility(View.VISIBLE);
                bumpUi();
            }

            @Override
            public void onStopTrackingTouch(SeekBar bar) {
                dragging = false;
                tvPreview.setVisibility(View.GONE);
                if (player != null) {
                    long d = player.getDuration();
                    if (d > 0) player.seekTo(bar.getProgress() * d / 1000L);
                }
                bumpUi();
            }
        });

        findViewById(R.id.btn_speed).setOnClickListener(v -> showSpeedMenu());
        findViewById(R.id.btn_subs).setOnClickListener(v -> showTrackMenu(C.TRACK_TYPE_TEXT));
        findViewById(R.id.btn_audio).setOnClickListener(v -> showTrackMenu(C.TRACK_TYPE_AUDIO));

        // v0.18.0 — zoom cycle, sleep timer, cinema, episodes + prev/next
        findViewById(R.id.btn_zoom).setOnClickListener(v -> cycleZoom());
        findViewById(R.id.btn_sleep).setOnClickListener(v -> showSleepMenu());
        findViewById(R.id.btn_cinema).setOnClickListener(v -> showCinemaDialog());
        ImageButton btnEpisodes = (ImageButton) findViewById(R.id.btn_episodes);
        ImageButton btnPrev = (ImageButton) findViewById(R.id.btn_prev);
        ImageButton btnNext = (ImageButton) findViewById(R.id.btn_next);
        tvSleep = (TextView) findViewById(R.id.tv_sleep);
        updateSleepChip();
        if (epIds != null && epIds.length > 1 && epIds[0] != 0) {
            btnEpisodes.setVisibility(View.VISIBLE);
            btnEpisodes.setOnClickListener(v -> showEpisodesSheet());
            if (epIndex > 0) {
                btnPrev.setVisibility(View.VISIBLE);
                btnPrev.setOnClickListener(v -> finishWithSwitch(epIds[epIndex - 1]));
            }
            if (epIndex < epIds.length - 1) {
                btnNext.setVisibility(View.VISIBLE);
                btnNext.setOnClickListener(v -> finishWithSwitch(epIds[epIndex + 1]));
            }
        }

        findViewById(R.id.btn_lock).setOnClickListener(v -> setLocked(true));
        lockChip.setOnLongClickListener(v -> {
            setLocked(false);
            return true;
        });

        showControls();
        updatePlayPauseIcon();
    }

    private void togglePlayPause() {
        if (player == null) return;
        if (player.isPlaying()) player.pause();
        else player.play();
    }

    private void seekBy(long deltaMs) {
        if (player == null) return;
        long d = player.getDuration();
        long target = player.getCurrentPosition() + deltaMs;
        if (d > 0 && target > d) target = d;
        if (target < 0) target = 0;
        player.seekTo(target);
        gestureSurface.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY);
    }

    private void updatePlayPauseIcon() {
        if (player == null || btnPlayPause == null) return;
        btnPlayPause.setImageResource(player.isPlaying() ? R.drawable.ic_np_pause : R.drawable.ic_np_play);
    }

    private void updateUi() {
        if (player == null || seek == null || dragging) return;
        long pos = player.getCurrentPosition();
        long d = player.getDuration();
        seek.setProgress(d > 0 ? (int) (pos * 1000L / d) : 0);
        seek.setSecondaryProgress((int) (player.getBufferedPercentage() * 10f));
        tvPosition.setText(clock(pos / 1000L));
        tvDuration.setText(clock(d > 0 ? d / 1000L : 0));
    }

    private void showControls() {
        if (locked) return;
        controlsVisible = true;
        topBar.setVisibility(View.VISIBLE);
        bottomBar.setVisibility(View.VISIBLE);
        btnPlayPause.setVisibility(View.VISIBLE);
        bumpUi();
    }

    private void hideControls() {
        if (locked || (player != null && !player.isPlaying())) return; // paused → stay visible
        controlsVisible = false;
        topBar.setVisibility(View.GONE);
        bottomBar.setVisibility(View.GONE);
        btnPlayPause.setVisibility(View.GONE);
    }

    private void bumpUi() {
        tick.removeCallbacks(hideRunnable);
        tick.postDelayed(hideRunnable, 3500L);
    }

    private void setLocked(boolean on) {
        locked = on;
        lockChip.setVisibility(on ? View.VISIBLE : View.GONE);
        if (on) {
            controlsVisible = false;
            topBar.setVisibility(View.GONE);
            bottomBar.setVisibility(View.GONE);
            btnPlayPause.setVisibility(View.GONE);
            tick.removeCallbacks(hideRunnable);
            Toast.makeText(this, "صفحه قفل شد — برای باز کردن نگه دارید", Toast.LENGTH_SHORT).show();
        } else {
            showControls();
        }
    }

    private void flashLockChip() {
        lockChip.setAlpha(0.4f);
        lockChip.animate().alpha(1f).setDuration(350).start();
        gestureSurface.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY);
    }

    private void showRipple(boolean forward) {
        TextView tv = new TextView(this);
        long stepSec = Math.max(1, seekStepMs / 1000);
        tv.setText(fa(String.valueOf(stepSec)) + " ثانیه به " + (forward ? "جلو" : "عقب"));
        tv.setTextColor(Color.WHITE);
        tv.setTextSize(14);
        tv.setBackgroundResource(R.drawable.np_ripple);
        tv.setPadding(28, 40, 28, 40);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER);
        rippleHost.addView(tv, lp);
        tv.setScaleX(0.75f);
        tv.setScaleY(0.75f);
        tv.animate().scaleX(1.15f).scaleY(1.15f).alpha(0f).setDuration(480)
            .withEndAction(() -> rippleHost.removeView(tv)).start();
        gestureSurface.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY);
    }

    private void showSpeedMenu() {
        if (player == null) return;
        // v0.18.0 — 0.25×–3× (web-parity range; was 0.5×–2×)
        float[] speeds = {0.25f, 0.5f, 0.75f, 1f, 1.25f, 1.5f, 2f, 3f};
        String[] labels = {"۰٫۲۵×", "۰٫۵×", "۰٫۷۵×", "۱×", "۱٫۲۵×", "۱٫۵×", "۲×", "۳×"};
        float cur = player.getPlaybackParameters().speed;
        PopupMenu pm = new PopupMenu(this, findViewById(R.id.btn_speed));
        for (int i = 0; i < speeds.length; i++) {
            pm.getMenu().add(0, i, i, (Math.abs(cur - speeds[i]) < 0.01f ? "✓ " : "") + labels[i]);
        }
        pm.setOnMenuItemClickListener(item -> {
            float s = speeds[item.getItemId()];
            player.setPlaybackParameters(new PlaybackParameters(s));
            Toast.makeText(this, "سرعت: " + labels[item.getItemId()], Toast.LENGTH_SHORT).show();
            return true;
        });
        pm.show();
    }

    /** Embedded track picker (subtitles / audio) — parity with the web
     *  player's subtitle & audio sheets. External user-uploaded subs are
     *  handed to Media3 through playVideo's subs param when provided. */
    private void showTrackMenu(final int trackType) {
        if (player == null) return;
        Tracks tracks = player.getCurrentTracks();
        List<Tracks.Group> groups = new ArrayList<>();
        for (Tracks.Group g : tracks.getGroups()) {
            if (g.getType() == trackType && g.length > 0) groups.add(g);
        }
        if (groups.isEmpty()) {
            Toast.makeText(this,
                trackType == C.TRACK_TYPE_TEXT
                    ? "زیرنویسی در این نسخه تعبیه نشده"
                    : "ترک صدای دیگری وجود ندارد",
                Toast.LENGTH_SHORT).show();
            return;
        }

        boolean disabled = player.getTrackSelectionParameters().disabledTrackTypes.contains(trackType);
        List<String> labels = new ArrayList<>();
        labels.add(trackType == C.TRACK_TYPE_TEXT ? "خاموش" : "پیش‌فرض");
        List<int[]> ref = new ArrayList<>(); // {groupIdx, trackIdx}
        int checked = disabled ? 0 : -1;
        for (int gi = 0; gi < groups.size(); gi++) {
            Tracks.Group g = groups.get(gi);
            for (int ti = 0; ti < g.length; ti++) {
                String label = g.getTrackFormat(ti).label;
                if (label == null || label.isEmpty()) {
                    label = g.getTrackFormat(ti).language;
                }
                if (label == null || label.isEmpty()) {
                    label = "ترک " + fa(String.valueOf(ref.size() + 1));
                }
                labels.add(label);
                ref.add(new int[] { gi, ti });
                if (!disabled && g.isTrackSelected(ti) && checked < 0) checked = ref.size();
            }
        }
        if (checked < 0) checked = 0;

        new AlertDialog.Builder(this)
            .setTitle(trackType == C.TRACK_TYPE_TEXT ? "زیرنویس" : "ترک صدا")
            .setSingleChoiceItems(labels.toArray(new String[0]), checked,
                (DialogInterface dlg, int which) -> {
                    dlg.dismiss();
                    if (player == null) return;
                    TrackSelectionParameters.Builder pb =
                        player.getTrackSelectionParameters().buildUpon();
                    if (which == 0) {
                        pb.clearOverridesOfType(trackType);
                        pb.setTrackTypeDisabled(trackType, true);
                    } else {
                        int[] r = ref.get(which - 1);
                        Tracks.Group g = groups.get(r[0]);
                        pb.setTrackTypeDisabled(trackType, false);
                        pb.setOverrideForType(
                            new TrackSelectionOverride(g.getMediaTrackGroup(), r[1]));
                    }
                    player.setTrackSelectionParameters(pb.build());
                })
            .setNegativeButton("بستن", null)
            .show();
    }

    /* ================= v0.18.0 — zoom / sleep / episodes / cinema ================= */

    /** fit → fill (crop) → stretch cycle, same contract as the web player */
    private void cycleZoom() {
        resizeModeIdx = (resizeModeIdx + 1) % RESIZE_MODES.length;
        playerView.setResizeMode(RESIZE_MODES[resizeModeIdx]);
        Toast.makeText(this, "نمایش: " + RESIZE_LABELS[resizeModeIdx], Toast.LENGTH_SHORT).show();
        gestureSurface.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY);
    }

    private void showSleepMenu() {
        CharSequence[] opts = {"۱۵ دقیقه", "۳۰ دقیقه", "۴۵ دقیقه", "۶۰ دقیقه", "پایان همین قسمت", "لغو تایمر"};
        new AlertDialog.Builder(this)
            .setTitle("تایمر خواب")
            .setItems(opts, (dlg, which) -> {
                if (which == 4) {
                    sleepEndOfEpisode = true;
                    sleepLeftSec = -1;
                    Toast.makeText(this, "خواب: پایان همین قسمت", Toast.LENGTH_SHORT).show();
                } else if (which == 5) {
                    sleepEndOfEpisode = false;
                    sleepLeftSec = -1;
                } else {
                    sleepEndOfEpisode = false;
                    sleepLeftSec = (which + 1) * 15 * 60;
                    Toast.makeText(this, "خواب: " + opts[which], Toast.LENGTH_SHORT).show();
                }
                updateSleepChip();
            })
            .show();
    }

    private void updateSleepChip() {
        if (tvSleep == null) return;
        if (sleepEndOfEpisode) {
            tvSleep.setVisibility(View.VISIBLE);
            tvSleep.setText("خواب: پایان قسمت");
        } else if (sleepLeftSec >= 0) {
            tvSleep.setVisibility(View.VISIBLE);
            tvSleep.setText("خواب: " + clock(sleepLeftSec));
        } else {
            tvSleep.setVisibility(View.GONE);
        }
    }

    private void tickSleep() {
        if (sleepLeftSec < 0) return;
        sleepLeftSec -= 1;
        if (sleepLeftSec <= 0) {
            sleepLeftSec = -1;
            updateSleepChip();
            fadeOutAndPause();
        } else {
            updateSleepChip();
        }
    }

    /** sleep expiry: fade the volume over ~5s, then pause and restore */
    private void fadeOutAndPause() {
        if (player == null) return;
        final float start = player.getVolume();
        final int[] i = {0};
        tick.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (player == null) return;
                i[0]++;
                player.setVolume(Math.max(0f, start * (1 - i[0] / 10f)));
                if (i[0] < 10) {
                    tick.postDelayed(this, 500);
                } else {
                    player.setVolume(start); // restore for the next session
                    player.pause();
                    Toast.makeText(PlayerActivity.this, "تایمر خواب تمام شد", Toast.LENGTH_SHORT).show();
                }
            }
        }, 500);
    }

    /** v0.18.0 — episodes sheet from the JS manifest: seasons, watched ticks,
     *  progress; picking an episode finishes the activity with the result
     *  extra the JS engine understands (switchToEpisodeId). */
    private void showEpisodesSheet() {
        if (epIds == null || epIds.length == 0 || epIds[0] == 0) return;
        int pad = (int) (14 * getResources().getDisplayMetrics().density);
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(pad, pad, pad, pad);
        ScrollView scroller = new ScrollView(this);
        scroller.addView(box);
        for (int i = 0; i < epIds.length; i++) {
            TextView row = new TextView(this);
            String label = "فصل " + fa(String.valueOf(epSeasons[i])) + " · قسمت " + fa(String.valueOf(epNums[i]));
            if (epNames[i] != null && !epNames[i].isEmpty()) label += "  —  " + epNames[i];
            if (epWatched[i]) label += "   ✓ دیده‌شده";
            else if (epPcts[i] > 0) label += "   (" + fa(String.valueOf(epPcts[i])) + "٪)";
            if (i == epIndex) label = "▶ " + label;
            row.setText(label);
            row.setTextSize(14);
            row.setTextColor(Color.WHITE);
            row.setPadding(0, pad / 2, 0, pad / 2);
            if (i == epIndex) {
                row.setTypeface(null, android.graphics.Typeface.BOLD);
                row.setTextColor(0xFFFFC46B);
            }
            box.addView(row);
        }
        AlertDialog dlg = new AlertDialog.Builder(this)
            .setTitle("قسمت‌ها")
            .setView(scroller)
            .setNegativeButton("بستن", null)
            .create();
        for (int i = 0; i < box.getChildCount(); i++) {
            final int idx = i;
            box.getChildAt(i).setOnClickListener(v -> {
                dlg.dismiss();
                if (idx != epIndex && epIds[idx] != 0) finishWithSwitch(epIds[idx]);
            });
        }
        dlg.show();
    }

    /** v0.18.0 — the honest cinema entry: native playback cannot join a watch
     *  party (blocking activity, no live beats) — offer the web-variant switch
     *  when the JS side says one exists. */
    private void showCinemaDialog() {
        String msg = "سینما (تماشای هم‌زمان با دوستان) فقط با پخش وب کار می‌کند و با پلیر دستگاه ممکن نیست."
            + (hasWebVariant
                ? "\n\nمی‌توانی به نسخه وب‌سازگار همین عنوان سوئیچ کنی و سینما را روشن کنی."
                : "\n\nاین فایل نسخه وب‌سازگار ندارد — سینما برای آن ممکن نیست.");
        AlertDialog.Builder b = new AlertDialog.Builder(this)
            .setTitle("سینما")
            .setMessage(msg)
            .setPositiveButton(hasWebVariant ? "سوییچ به نسخه وب‌سازگار" : "فهمیدم", (d, w) -> {
                if (hasWebVariant) finishWithWebSwitch();
            });
        if (hasWebVariant) b.setNegativeButton("بستن", null);
        b.show();
        gestureSurface.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY);
    }

    private boolean audioDropped = false;
    /** v0.21.1 — audio hardening: audio groups already attempted (by their
     *  position in getCurrentTracks()), so each error advances to the NEXT
     *  untried track instead of repeating the same failed one. */
    private final Set<Integer> triedAudioGroups = new HashSet<>();
    /** v0.21.1 — hard cap on alternate-audio prepares per activity: bounds
     *  the video-side failure path (each retry costs one prepare cycle). */
    private static final int MAX_AUDIO_ALTS = 3;
    private int audioAltTries = 0;

    /** v0.21.1 — select the next UNTRIED audio group when the selected one's
     *  codec cannot be decoded (multi-audio MKVs). Bounded: each call marks
     *  the group it tries, so the sequence terminates. Returns false when no
     *  untried, plausibly-decodable group remains → the caller mutes. */
    private boolean tryNextAudioTrack() {
        try {
            Tracks tracks = player.getCurrentTracks();
            List<Tracks.Group> audio = new ArrayList<>();
            List<Integer> audioGi = new ArrayList<>(); // full-list index per audio group
            int selIdx = -1; // position WITHIN the audio list
            for (int gi = 0; gi < tracks.getGroups().size(); gi++) {
                Tracks.Group g = tracks.getGroups().get(gi);
                if (g.getType() != C.TRACK_TYPE_AUDIO) continue;
                audio.add(g);
                audioGi.add(gi);
                if (selIdx < 0) {
                    for (int ti = 0; ti < g.length; ti++) {
                        if (g.isTrackSelected(ti)) {
                            selIdx = audio.size() - 1;
                            break;
                        }
                    }
                }
            }
            if (audio.size() <= 1) return false; // nothing to alternate to
            for (int i = 0; i < audio.size(); i++) {
                int gi = audioGi.get(i);
                if (i == selIdx || triedAudioGroups.contains(gi)) continue;
                Tracks.Group g = audio.get(i);
                if (!g.isTrackSupported(0)) {
                    triedAudioGroups.add(gi);
                    continue;
                }
                triedAudioGroups.add(gi);
                player.setTrackSelectionParameters(
                    player.getTrackSelectionParameters().buildUpon()
                        .setOverrideForType(new TrackSelectionOverride(g.getMediaTrackGroup(), 0))
                        .build());
                player.prepare();
                player.setPlayWhenReady(true);
                return true;
            }
            return false;
        } catch (Throwable t) {
            return false;
        }
    }

    /** v0.18.0 — episodes sheet picked another episode: hand the choice back
     *  to the JS engine (which re-runs ownership/handoff for that episode). */
    private void finishWithSwitch(int episodeId) {
        if (player != null) {
            sPositionMs = Math.max(0L, player.getCurrentPosition());
            long d = player.getDuration();
            if (d > 0) sDurationMs = d;
        }
        Intent data = new Intent();
        data.putExtra("positionMs", sPositionMs);
        data.putExtra("durationMs", sDurationMs);
        data.putExtra("switchToEpisodeId", episodeId);
        setResult(RESULT_OK, data);
        super.finish();
    }

    /** v0.18.0 — «سوییچ به نسخه وب‌سازگار»: the web player + cinema takes over */
    private void finishWithWebSwitch() {
        if (player != null) {
            sPositionMs = Math.max(0L, player.getCurrentPosition());
            long d = player.getDuration();
            if (d > 0) sDurationMs = d;
        }
        Intent data = new Intent();
        data.putExtra("positionMs", sPositionMs);
        data.putExtra("durationMs", sDurationMs);
        data.putExtra("switchToWeb", true);
        setResult(RESULT_OK, data);
        super.finish();
    }

    @Override
    public void finish() {
        Intent data = new Intent();
        if (player != null) {
            sPositionMs = Math.max(0L, player.getCurrentPosition());
            long d = player.getDuration();
            if (d > 0) sDurationMs = d;
        }
        data.putExtra("positionMs", sPositionMs);
        data.putExtra("durationMs", sDurationMs);
        data.putExtra("ended", sEnded);
        data.putExtra("error", sError);
        // v0.18.0 — «پایان همین قسمت» sleep mode must suppress the JS
        // next-episode countdown
        data.putExtra("suppressNext", sleepEndOfEpisode);
        setResult(RESULT_OK, data);
        super.finish();
    }

    @Override
    protected void onDestroy() {
        tick.removeCallbacks(tickRunner);
        tick.removeCallbacks(uiRunnable);
        tick.removeCallbacks(hideRunnable);
        if (mediaSession != null) {
            try {
                mediaSession.release();
            } catch (Exception ignored) {
            }
            mediaSession = null;
        }
        if (playerView != null) playerView.setPlayer(null);
        if (player != null) {
            player.release();
            player = null;
        }
        super.onDestroy();
    }

}
