import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

type BalloonItem = {
  id: number;
  color: string;
  highlight: string;
  isHit: boolean;
  isPopped: boolean;
};

type GameStatus = 'idle' | 'playing' | 'won' | 'lost';

// 5個すべて異なるカラフルな風船カラー
const BALLOON_COLORS = [
  { color: '#FF595E', highlight: '#FF9296' }, // コーラルレッド
  { color: '#FFCA3A', highlight: '#FFE28A' }, // サニーイエロー
  { color: '#8AC926', highlight: '#B5E46B' }, // フレッシュグリーン
  { color: '#1982C4', highlight: '#6AB7E8' }, // オーシャンブルー
  { color: '#9B5DE5', highlight: '#C79EF7' }, // グレープパープル
];

const CONFETTI_COLORS = [
  '#FFD700',
  '#FF6B6B',
  '#4ECDC4',
  '#FF9F1C',
  '#A06CD5',
  '#FFF3B0',
  '#48CAE4',
];

const GAME_DURATION = 30;
const TARGET_HITS = 2;
const MAX_MISSES = 2;

export function App() {
  const [status, setStatus] = useState<GameStatus>('idle');
  const [balloons, setBalloons] = useState<BalloonItem[]>([]);
  const [timeLeft, setTimeLeft] = useState<number>(GAME_DURATION);
  const [hitsFound, setHitsFound] = useState<number>(0);
  const [missesCount, setMissesCount] = useState<number>(0);
  const [loseReason, setLoseReason] = useState<'time' | 'miss' | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);

  // AudioContextの初期化
  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      const AudioCtx =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new AudioCtx();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  // 風船が割れる音
  const playPopSound = useCallback(
    (isHit: boolean) => {
      const ctx = getAudioContext();
      const now = ctx.currentTime;

      // 破裂ノイズ＋ピッチ変化
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = isHit ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(isHit ? 520 : 280, now);
      osc.frequency.exponentialRampToValueAtTime(isHit ? 980 : 90, now + 0.16);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.18);

      if (isHit) {
        // 当たり時のキラッとしたチャイム音
        const chime = ctx.createOscillator();
        const chimeGain = ctx.createGain();
        chime.type = 'sine';
        chime.frequency.setValueAtTime(1046.5, now + 0.08); // C6
        chime.frequency.setValueAtTime(1318.5, now + 0.18); // E6
        chimeGain.gain.setValueAtTime(0.25, now + 0.08);
        chimeGain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);
        chime.connect(chimeGain);
        chimeGain.connect(ctx.destination);
        chime.start(now + 0.08);
        chime.stop(now + 0.45);
      }
    },
    [getAudioContext]
  );

  // 10秒前カウントダウンのビープ音
  const playCountdownBeep = useCallback(
    (sec: number) => {
      const ctx = getAudioContext();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(sec <= 3 ? 880 : 660, now);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.005, now + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.12);
    },
    [getAudioContext]
  );

  // クリア時：ファンファーレ
  const playFanfare = useCallback(() => {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    // ド・ミ・ソ・ド〜♪
    const notes = [
      { freq: 523.25, time: 0.0, dur: 0.16 }, // C5
      { freq: 659.25, time: 0.16, dur: 0.16 }, // E5
      { freq: 783.99, time: 0.32, dur: 0.16 }, // G5
      { freq: 1046.5, time: 0.5, dur: 0.65 }, // C6
      { freq: 783.99, time: 0.5, dur: 0.65 }, // 和音 G5
      { freq: 659.25, time: 0.5, dur: 0.65 }, // 和音 E5
    ];

    notes.forEach((n) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(n.freq, now + n.time);
      gain.gain.setValueAtTime(0.22, now + n.time);
      gain.gain.exponentialRampToValueAtTime(0.005, now + n.time + n.dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + n.time);
      osc.stop(now + n.time + n.dur);
    });
  }, [getAudioContext]);

  // 失敗時：悲しい音楽（下降短調メロディ）
  const playSadMusic = useCallback(() => {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const notes = [
      { freq: 392.0, time: 0.0, dur: 0.35 }, // G4
      { freq: 369.99, time: 0.38, dur: 0.35 }, // F#4
      { freq: 349.23, time: 0.76, dur: 0.35 }, // F4
      { freq: 329.63, time: 1.14, dur: 0.9 }, // E4
    ];

    notes.forEach((n) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(n.freq, now + n.time);
      // 少しピッチを下げて悲しさを演出
      osc.frequency.linearRampToValueAtTime(n.freq * 0.96, now + n.time + n.dur);

      gain.gain.setValueAtTime(0.24, now + n.time);
      gain.gain.exponentialRampToValueAtTime(0.005, now + n.time + n.dur);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + n.time);
      osc.stop(now + n.time + n.dur);
    });
  }, [getAudioContext]);

  // ゲーム初期化・スタート
  const startGame = () => {
    getAudioContext();
    // 5個中2個をランダムに当たりにする
    const hitIndices = new Set<number>();
    while (hitIndices.size < TARGET_HITS) {
      hitIndices.add(Math.floor(Math.random() * 5));
    }

    const initialBalloons: BalloonItem[] = BALLOON_COLORS.map((c, idx) => ({
      id: idx,
      color: c.color,
      highlight: c.highlight,
      isHit: hitIndices.has(idx),
      isPopped: false,
    }));

    setBalloons(initialBalloons);
    setTimeLeft(GAME_DURATION);
    setHitsFound(0);
    setMissesCount(0);
    setLoseReason(null);
    setStatus('playing');
  };

  // タイマー処理
  useEffect(() => {
    if (status !== 'playing') return;

    const timer = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setStatus('lost');
          setLoseReason('time');
          playSadMusic();
          return 0;
        }
        const next = prev - 1;
        if (next <= 10) {
          playCountdownBeep(next);
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [status, playCountdownBeep, playSadMusic]);

  // 風船をクリックしたときの処理
  const handlePopBalloon = (id: number) => {
    if (status !== 'playing') return;

    const target = balloons.find((b) => b.id === id);
    if (!target || target.isPopped) return;

    playPopSound(target.isHit);

    const updatedBalloons = balloons.map((b) =>
      b.id === id ? { ...b, isPopped: true } : b
    );
    setBalloons(updatedBalloons);

    if (target.isHit) {
      const nextHits = hitsFound + 1;
      setHitsFound(nextHits);
      if (nextHits >= TARGET_HITS) {
        setStatus('won');
        playFanfare();
      }
    } else {
      const nextMisses = missesCount + 1;
      setMissesCount(nextMisses);
      if (nextMisses >= MAX_MISSES) {
        setStatus('lost');
        setLoseReason('miss');
        playSadMusic();
      }
    }
  };

  // キラキラテープの生成データ
  const confettiPieces = Array.from({ length: 45 }, (_, i) => ({
    id: i,
    left: `${(i * 2.3) % 100}%`,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    delay: `${(i % 10) * 0.25}s`,
    duration: `${2.2 + (i % 5) * 0.4}s`,
  }));

  return (
    <div className="game-container">
      {/* 10秒前カウントダウンの背景透かし */}
      {status === 'playing' && timeLeft <= 10 && timeLeft > 0 && (
        <div className="big-countdown">{timeLeft}</div>
      )}

      {/* クリア時：キラキラテープが舞う演出 */}
      {status === 'won' && (
        <div className="confetti-layer">
          {confettiPieces.map((p) => (
            <div
              key={p.id}
              className="confetti-piece"
              style={{
                left: p.left,
                backgroundColor: p.color,
                animationDelay: p.delay,
                animationDuration: p.duration,
              }}
            />
          ))}
        </div>
      )}

      {/* 失敗時：風船を流し去る水流 */}
      {status === 'lost' && <div className="water-stream" />}

      {/* ヘッダー・ステータスバー */}
      <header className="header">
        <h1 className="title">🎈 どきどき風船割りゲーム 🎈</h1>
        <div className="status-bar">
          <div className="status-item">
            <span>のこり時間</span>
            <span
              className={`status-value ${
                timeLeft <= 10 && status === 'playing' ? 'timer-danger' : 'timer-normal'
              }`}
            >
              {timeLeft}秒
            </span>
          </div>
          <div className="status-item">
            <span>あたり</span>
            <span className="status-value" style={{ color: '#f59f00' }}>
              {hitsFound} / {TARGET_HITS}
            </span>
          </div>
          <div className="status-item">
            <span>はずれ許容</span>
            <span className="status-value" style={{ color: '#e63946' }}>
              {missesCount} / {MAX_MISSES}
            </span>
          </div>
        </div>
      </header>

      {/* 風船ステージ */}
      <main className="balloon-stage">
        {(status === 'idle'
          ? BALLOON_COLORS.map((c, idx) => ({
              id: idx,
              color: c.color,
              highlight: c.highlight,
              isHit: false,
              isPopped: false,
            }))
          : balloons
        ).map((balloon) => (
          <div
            key={balloon.id}
            className={`balloon-wrapper ${balloon.isPopped ? 'popped' : ''} ${
              status !== 'playing' ? 'disabled' : ''
            } ${status === 'lost' ? 'washed-away' : ''}`}
            onClick={() => handlePopBalloon(balloon.id)}
          >
            {!balloon.isPopped ? (
              <svg
                className="balloon-svg"
                viewBox="0 0 120 165"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* ひも */}
                <path
                  d="M60 116 Q52 135 62 148 T58 164"
                  fill="none"
                  stroke="#6c757d"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                {/* 結び目 */}
                <polygon points="54,116 66,116 60,108" fill={balloon.color} />
                {/* 風船本体 */}
                <ellipse cx="60" cy="58" rx="48" ry="54" fill={balloon.color} />
                {/* ツヤ（ハイライト） */}
                <ellipse
                  cx="42"
                  cy="38"
                  rx="11"
                  ry="20"
                  transform="rotate(-22 42 38)"
                  fill={balloon.highlight}
                  opacity="0.75"
                />
              </svg>
            ) : (
              <div
                className={`pop-result ${
                  balloon.isHit ? 'pop-hit' : 'pop-miss'
                }`}
              >
                <span className="pop-icon">{balloon.isHit ? '🌟' : '💨'}</span>
                <span className="pop-label">
                  {balloon.isHit ? 'あたり！' : 'はずれ'}
                </span>
              </div>
            )}
          </div>
        ))}
      </main>

      {/* スタート・結果メッセージパネル */}
      {status !== 'playing' && (
        <div className="overlay-panel">
          {status === 'idle' && (
            <>
              <h2 className="result-title" style={{ color: '#1b5e8a' }}>
                5個の風船から「あたり」を2個見つけよう！
              </h2>
              <p className="result-desc">
                制限時間は30秒。2回はずれるとゲームオーバー！
              </p>
              <button className="action-btn" onClick={startGame}>
                ゲームスタート！
              </button>
            </>
          )}

          {status === 'won' && (
            <>
              <h2 className="result-title result-win">
                🎉 クリアおめでとう！ 🎉
              </h2>
              <p className="result-desc">
                のこり {timeLeft} 秒であたりを2個見つけました！
              </p>
              <button className="action-btn" onClick={startGame}>
                もういちど遊ぶ
              </button>
            </>
          )}

          {status === 'lost' && (
            <>
              <h2 className="result-title result-lose">
                😢 ざんねん…ゲームオーバー
              </h2>
              <p className="result-desc">
                {loseReason === 'time'
                  ? '時間切れ！風船が水に流されてしまいました…'
                  : '2回はずれてしまい、風船が水に流されてしまいました…'}
              </p>
              <button className="action-btn" onClick={startGame}>
                リベンジする
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default App;