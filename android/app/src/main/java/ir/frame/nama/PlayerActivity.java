package ir.frame.nama;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.WindowManager;
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
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.okhttp.OkHttpDataSource;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector;
import androidx.media3.ui.PlayerView;

/**
 * v0.12.0 — native fullscreen player.
 *
 * The Android WebView cannot demux Matroska: ~8,200 of the catalog's videos
 * are MKV (every SoftSub release) and simply never played in the responsive
 * web player. ExoPlayer/Media3 plays MKV (+ HEVC when the device has the
 * decoder) and renders the Persian SRT muxed INSIDE the container — which is
 * exactly the audience this app serves.
 *
 * Result contract (back to the JS player through NamaNativePlugin):
 * positionMs / durationMs / ended / error.
 */
public class PlayerActivity extends Activity {

    private ExoPlayer player;
    private PlayerView playerView;
    private final Handler tick = new Handler(Looper.getMainLooper());

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
            tick.postDelayed(this, 1000L);
        }
    };

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

        sEnded = false;
        sError = "";

        DefaultRenderersFactory renderers =
            new DefaultRenderersFactory(this)
                .setEnableDecoderFallback(true)
                .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_OFF);

        // v0.16.1 — ride the EXACT same network behavior the desktop app uses
        // (electron/stream-proxy.cjs proxyFetch): the same desktop-Chrome UA
        // (dl hosts run UA filters), full redirect chains including
        // http⇄https, and certificate-relaxed TLS (the desktop sets
        // rejectUnauthorized:false — the archive's dl hosts are a minefield
        // of broken/expired certs that would otherwise kill playback ONLY on
        // Android). Timeouts mirror the previous DefaultHttpDataSource.
        String DESKTOP_UA =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
                + "Chrome/126.0 Safari/537.36";
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
        okhttp3.OkHttpClient httpClient = new okhttp3.OkHttpClient.Builder()
            .sslSocketFactory(sslContext.getSocketFactory(), trustAll)
            .hostnameVerifier((hostname, session) -> true)
            .connectTimeout(15, java.util.concurrent.TimeUnit.SECONDS)
            .readTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build(); // followRedirects + followSslRedirects (http⇄https) default ON

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
        builder.setMediaMetadata(
            new MediaMetadata.Builder()
                .setTitle(title == null ? "Frame" : title)
                .setArtist(subtitle == null ? "" : subtitle)
                .build());

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
            public void onPlayerError(androidx.media3.common.PlaybackException error) {
                sError = error.getMessage() == null ? "playback-error" : error.getMessage();
                Toast.makeText(PlayerActivity.this,
                    "پخش این نسخه ممکن نشد", Toast.LENGTH_LONG).show();
                tick.postDelayed(() -> finish(), 600L);
            }
        });

        tick.post(tickRunner);
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
        setResult(RESULT_OK, data);
        super.finish();
    }

    @Override
    protected void onDestroy() {
        tick.removeCallbacks(tickRunner);
        if (playerView != null) playerView.setPlayer(null);
        if (player != null) {
            player.release();
            player = null;
        }
        super.onDestroy();
    }

}
