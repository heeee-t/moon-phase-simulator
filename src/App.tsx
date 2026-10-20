import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Compass,
  Sparkles,
  BookOpen,
  Download,
  Copy,
  Check,
  Globe,
  Sun,
  AlertCircle
} from 'lucide-react';

// 8 Major key phases and angles
const MAJOR_PHASES = [
  { deg: 0, name: "삭", lunarDay: "음력 1일", desc: "달이 태양과 같은 방향에 있어 지구에서 보이지 않는 상태" },
  { deg: 45, name: "초승", lunarDay: "음력 2~3일", desc: "오른쪽 눈썹 모양으로 일몰 후 서쪽 하늘에서 짧게 관측" },
  { deg: 90, name: "상현", lunarDay: "음력 7~8일", desc: "오른쪽 반이 밝은 D자형 반달로 초저녁 남쪽 하늘에서 밝게 보임" },
  { deg: 135, name: "상현~망 사이", lunarDay: "음력 11~12일", desc: "상현달을 지나 보름달을 향해 오른쪽부터 차오르는 달" },
  { deg: 180, name: "망", lunarDay: "음력 15일", desc: "달의 전면이 태양빛을 완전히 받아 둥글게 빛나는 보름달" },
  { deg: 225, name: "망~하현 사이", lunarDay: "음력 18~19일", desc: "보름달을 지나 오른쪽부터 이지러져 왼쪽이 불룩한 형태" },
  { deg: 270, name: "하현", lunarDay: "음력 22~23일", desc: "왼쪽 반이 밝은 역D자형 반달로 자정에 떠 새벽 남쪽에 위치" },
  { deg: 315, name: "그믐", lunarDay: "음력 27~28일", desc: "왼쪽 가장자리만 가늘게 남아 일출 직전 동쪽 하늘에 관측" }
];

const SNAP_THRESHOLD = 3.2; // degrees for magnetic snap

// NASA LRO authentic photographic lunar map URL
const NASA_MOON_TEXTURE_URL = "https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/moon_1024.jpg";

export default function App() {
  const [angle, setAngle] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1.0); // max 2.0x
  const [showSightline, setShowSightline] = useState<boolean>(true);
  const [showSunlightRays, setShowSunlightRays] = useState<boolean>(true);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [copiedHtml, setCopiedHtml] = useState<boolean>(false);

  // Center toast warning
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  // Dragging interaction state
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const rawPointerAngleRef = useRef<number>(0);
  const reverseAccumulatorRef = useRef<number>(0);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const moonCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Cached photographic lunar disk textures
  const litMoonCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const darkMoonCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [, setTextureReady] = useState<boolean>(false);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 2400);
  }, []);

  // Magnetic snap helper
  const applyMagneticSnap = useCallback((deg: number, threshold = SNAP_THRESHOLD): number => {
    const norm = (deg % 360 + 360) % 360;
    for (const phase of MAJOR_PHASES) {
      let diff = Math.abs(norm - phase.deg);
      if (diff > 180) diff = 360 - diff;
      if (diff <= threshold) {
        return phase.deg;
      }
    }
    return norm;
  }, []);

  // Update angle with robust drag direction tracking
  const handlePointerDrag = useCallback((rawNewAngle: number) => {
    const normRaw = (rawNewAngle % 360 + 360) % 360;
    const prevRaw = rawPointerAngleRef.current;
    const rawDelta = ((normRaw - prevRaw + 540) % 360) - 180;

    if (rawDelta >= 0) {
      reverseAccumulatorRef.current = 0;
      rawPointerAngleRef.current = normRaw;
      const displayAngle = applyMagneticSnap(normRaw);
      setAngle(displayAngle);
    } else {
      reverseAccumulatorRef.current += rawDelta;
      if (reverseAccumulatorRef.current <= -5.5) {
        showToast("달은 반시계 방향으로 지구 주위를 공전합니다.");
        reverseAccumulatorRef.current = 0;
      }
    }
  }, [applyMagneticSnap, showToast]);

  // Generate ultra-realistic photographic Moon disk texture
  useEffect(() => {
    const size = 440;
    const R = size / 2 - 20;
    const cx = size / 2;
    const cy = size / 2;

    const litCanvas = document.createElement('canvas');
    litCanvas.width = size;
    litCanvas.height = size;
    const litCtx = litCanvas.getContext('2d')!;

    const darkCanvas = document.createElement('canvas');
    darkCanvas.width = size;
    darkCanvas.height = size;
    const darkCtx = darkCanvas.getContext('2d')!;

    // Fallback high-fidelity procedural lunar renderer
    const drawProceduralMoon = () => {
      // Base highland tone
      const baseGrad = litCtx.createRadialGradient(cx - R * 0.2, cy - R * 0.2, R * 0.1, cx, cy, R);
      baseGrad.addColorStop(0, '#f2f3f7');
      baseGrad.addColorStop(0.5, '#d8d9e2');
      baseGrad.addColorStop(0.85, '#bcbeca');
      baseGrad.addColorStop(1, '#9699a6');
      litCtx.fillStyle = baseGrad;
      litCtx.beginPath();
      litCtx.arc(cx, cy, R, 0, Math.PI * 2);
      litCtx.fill();

      // Earthshine dark disk
      darkCtx.fillStyle = 'rgba(18, 22, 32, 0.94)';
      darkCtx.beginPath();
      darkCtx.arc(cx, cy, R, 0, Math.PI * 2);
      darkCtx.fill();

      // Realistic Lunar Maria (Seas) based on authentic coordinates
      const mariaLayers = [
        // Oceanus Procellarum & Mare Imbrium (NW)
        { x: cx - R * 0.38, y: cy - R * 0.25, rx: R * 0.35, ry: R * 0.42, rot: -0.25, col: 'rgba(74, 78, 92, 0.72)' },
        { x: cx - R * 0.22, y: cy - R * 0.32, rx: R * 0.26, ry: R * 0.24, rot: 0.1, col: 'rgba(68, 72, 85, 0.75)' },
        // Mare Frigoris (North rim)
        { x: cx, y: cy - R * 0.62, rx: R * 0.48, ry: R * 0.11, rot: 0.05, col: 'rgba(80, 84, 98, 0.65)' },
        // Mare Serenitatis & Tranquillitatis (NE)
        { x: cx + R * 0.24, y: cy - R * 0.20, rx: R * 0.21, ry: R * 0.22, rot: 0.15, col: 'rgba(70, 74, 88, 0.75)' },
        { x: cx + R * 0.28, y: cy + R * 0.04, rx: R * 0.25, ry: R * 0.22, rot: 0.3, col: 'rgba(76, 80, 94, 0.68)' },
        // Mare Crisium (Isolated East)
        { x: cx + R * 0.64, y: cy - R * 0.18, rx: R * 0.13, ry: R * 0.17, rot: 0.2, col: 'rgba(60, 64, 76, 0.82)' },
        // Mare Fecunditatis & Nectaris (SE)
        { x: cx + R * 0.38, y: cy + R * 0.28, rx: R * 0.19, ry: R * 0.18, rot: -0.1, col: 'rgba(78, 82, 96, 0.65)' },
        { x: cx + R * 0.20, y: cy + R * 0.34, rx: R * 0.13, ry: R * 0.14, rot: 0.2, col: 'rgba(72, 76, 90, 0.70)' },
        // Mare Nubium & Humorum (SW)
        { x: cx - R * 0.24, y: cy + R * 0.34, rx: R * 0.21, ry: R * 0.19, rot: 0.0, col: 'rgba(72, 76, 90, 0.72)' },
        { x: cx - R * 0.48, y: cy + R * 0.32, rx: R * 0.14, ry: R * 0.15, rot: -0.15, col: 'rgba(68, 72, 85, 0.75)' }
      ];

      mariaLayers.forEach(m => {
        litCtx.fillStyle = m.col;
        litCtx.beginPath();
        litCtx.ellipse(m.x, m.y, m.rx, m.ry, m.rot, 0, Math.PI * 2);
        litCtx.fill();

        // Dark side subtle shadow maria
        darkCtx.fillStyle = 'rgba(10, 13, 20, 0.96)';
        darkCtx.beginPath();
        darkCtx.ellipse(m.x, m.y, m.rx, m.ry, m.rot, 0, Math.PI * 2);
        darkCtx.fill();
      });

      // Tycho crater with brilliant radial ray system
      const tychoX = cx - R * 0.10;
      const tychoY = cy + R * 0.68;
      litCtx.save();
      litCtx.strokeStyle = 'rgba(255, 255, 255, 0.24)';
      litCtx.lineWidth = 1.2;
      for (let i = 0; i < 16; i++) {
        const rayA = (i * Math.PI) / 8 + 0.12;
        const len = R * (0.35 + (i % 4) * 0.22);
        litCtx.beginPath();
        litCtx.moveTo(tychoX, tychoY);
        litCtx.lineTo(tychoX + Math.cos(rayA) * len, tychoY + Math.sin(rayA) * len);
        litCtx.stroke();
      }
      litCtx.restore();

      // Copernicus rays & Kepler bright splash
      const copX = cx - R * 0.25;
      const copY = cy - R * 0.12;
      litCtx.save();
      litCtx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      litCtx.lineWidth = 1;
      for (let i = 0; i < 8; i++) {
        const rayA = (i * Math.PI) / 4;
        litCtx.beginPath();
        litCtx.moveTo(copX, copY);
        litCtx.lineTo(copX + Math.cos(rayA) * (R * 0.28), copY + Math.sin(rayA) * (R * 0.28));
        litCtx.stroke();
      }
      litCtx.restore();

      // Crater peaks
      litCtx.fillStyle = '#ffffff';
      litCtx.beginPath();
      litCtx.arc(tychoX, tychoY, R * 0.035, 0, Math.PI * 2);
      litCtx.fill();

      litCtx.fillStyle = '#ffffff';
      litCtx.beginPath();
      litCtx.arc(copX, copY, R * 0.045, 0, Math.PI * 2);
      litCtx.fill();

      // Aristarchus (Brightest spot)
      litCtx.fillStyle = '#ffffff';
      litCtx.beginPath();
      litCtx.arc(cx - R * 0.52, cy - R * 0.28, R * 0.025, 0, Math.PI * 2);
      litCtx.fill();

      // Limb darkening
      const limbGrad = litCtx.createRadialGradient(cx, cy, R * 0.86, cx, cy, R);
      limbGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      limbGrad.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
      litCtx.fillStyle = limbGrad;
      litCtx.beginPath();
      litCtx.arc(cx, cy, R, 0, Math.PI * 2);
      litCtx.fill();
    };

    drawProceduralMoon();
    litMoonCanvasRef.current = litCanvas;
    darkMoonCanvasRef.current = darkCanvas;
    setTextureReady(true);

    // Attempt to load NASA LRO authentic photographic texture and map orthographically
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = NASA_MOON_TEXTURE_URL;
    img.onload = () => {
      try {
        const srcW = img.width;
        const srcH = img.height;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = srcW;
        tempCanvas.height = srcH;
        const tempCtx = tempCanvas.getContext('2d')!;
        tempCtx.drawImage(img, 0, 0);
        const srcData = tempCtx.getImageData(0, 0, srcW, srcH).data;

        const outLitData = litCtx.createImageData(size, size);
        const outDarkData = darkCtx.createImageData(size, size);

        for (let py = 0; py < size; py++) {
          const dy = py - cy;
          for (let px = 0; px < size; px++) {
            const dx = px - cx;
            const distSq = dx * dx + dy * dy;
            const idx = (py * size + px) * 4;

            if (distSq <= R * R) {
              const nx = dx / R;
              const ny = dy / R;
              const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));

              // Spherical latitude (-PI/2 to PI/2) and longitude (-PI/2 to PI/2)
              const lat = Math.asin(-ny); // screen Y is down
              const lon = Math.atan2(nx, nz);

              // Equirectangular source texture coordinates (longitude 0 in middle)
              const u = (lon / Math.PI + 1) * 0.5;
              const v = 0.5 - lat / Math.PI;

              const sx = Math.floor(u * srcW) % srcW;
              const sy = Math.min(srcH - 1, Math.max(0, Math.floor(v * srcH)));
              const sIdx = (sy * srcW + sx) * 4;

              const r = srcData[sIdx];
              const g = srcData[sIdx + 1];
              const b = srcData[sIdx + 2];

              // Natural photographic color grading
              const limbDarkening = 0.65 + 0.35 * nz;
              outLitData.data[idx] = Math.min(255, Math.floor(r * 1.15 * limbDarkening));
              outLitData.data[idx + 1] = Math.min(255, Math.floor(g * 1.15 * limbDarkening));
              outLitData.data[idx + 2] = Math.min(255, Math.floor(b * 1.18 * limbDarkening));
              outLitData.data[idx + 3] = 255;

              // Dark side earthshine
              outDarkData.data[idx] = Math.floor(r * 0.08);
              outDarkData.data[idx + 1] = Math.floor(g * 0.09 + 6);
              outDarkData.data[idx + 2] = Math.floor(b * 0.12 + 10);
              outDarkData.data[idx + 3] = 230;
            } else {
              outLitData.data[idx + 3] = 0;
              outDarkData.data[idx + 3] = 0;
            }
          }
        }

        litCtx.putImageData(outLitData, 0, 0);
        darkCtx.putImageData(outDarkData, 0, 0);
        setTextureReady(prev => !prev);
      } catch {
        // Fallback procedural texture is already rendered
      }
    };
  }, []);

  // Auto-play counter-clockwise loop (max 2.0x)
  useEffect(() => {
    if (!isPlaying) return;
    let animId: number;
    let lastTime = performance.now();

    const loop = (time: number) => {
      const dt = (time - lastTime) / 1000;
      lastTime = time;
      const dDeg = 20 * speedMultiplier * dt;
      setAngle(prev => {
        const next = (prev + dDeg) % 360;
        rawPointerAngleRef.current = next;
        return next;
      });
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, speedMultiplier]);

  // Pointer drag event handlers for Space View (centered at 210, 250)
  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    setIsDragging(true);
    setIsPlaying(false);
    reverseAccumulatorRef.current = 0;

    if (svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      const svgCenterX = rect.left + rect.width * (210 / 500);
      const svgCenterY = rect.top + rect.height * (250 / 500);
      const dx = e.clientX - svgCenterX;
      const dy = e.clientY - svgCenterY;
      const rad = Math.atan2(-dy, dx);
      const deg = (rad * 180 / Math.PI + 360) % 360;
      rawPointerAngleRef.current = deg;
    }
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDragging && e.buttons !== 1) return;
    if (!svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    const svgCenterX = rect.left + rect.width * (210 / 500);
    const svgCenterY = rect.top + rect.height * (250 / 500);

    const dx = e.clientX - svgCenterX;
    const dy = e.clientY - svgCenterY;

    const rad = Math.atan2(-dy, dx);
    const deg = (rad * 180 / Math.PI + 360) % 360;

    handlePointerDrag(deg);
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch {
      // Safe ignore
    }
    setIsDragging(false);
    reverseAccumulatorRef.current = 0;

    setAngle(curr => {
      const snapped = applyMagneticSnap(curr, 5.0);
      rawPointerAngleRef.current = snapped;
      return snapped;
    });
  };

  const phaseInfo = useMemo(() => {
    const a = (angle % 360 + 360) % 360;
    // 0: 삭 (0° ± 12°: 348° ~ 12°)
    if (a >= 348 || a < 12) return MAJOR_PHASES[0];
    // 1: 초승 (12° ~ 70°)
    if (a >= 12 && a < 70) return MAJOR_PHASES[1];
    // 2: 상현 (90° ± 20°: 70° ~ 110° - 충분한 관측 시간 확보)
    if (a >= 70 && a <= 110) return MAJOR_PHASES[2];
    // 3: 상현~망 사이 (110° ~ 168°)
    if (a > 110 && a < 168) return MAJOR_PHASES[3];
    // 4: 망 (180° ± 12°: 168° ~ 192°)
    if (a >= 168 && a <= 192) return MAJOR_PHASES[4];
    // 5: 망~하현 사이 (192° ~ 250°)
    if (a > 192 && a < 250) return MAJOR_PHASES[5];
    // 6: 하현 (270° ± 20°: 250° ~ 290° - 충분한 관측 시간 확보)
    if (a >= 250 && a <= 290) return MAJOR_PHASES[6];
    // 7: 그믐 (290° ~ 348°)
    return MAJOR_PHASES[7];
  }, [angle]);

  // Preset button actions
  const jumpToPreset = (targetAngle: number) => {
    setIsPlaying(false);
    let current = (angle % 360 + 360) % 360;
    let target = (targetAngle % 360 + 360) % 360;
    if (target < current) target += 360;
    const diff = target - current;
    const duration = Math.min(600, Math.max(200, diff * 1.8));
    const startTime = performance.now();

    const step = (t: number) => {
      const p = Math.min(1, (t - startTime) / duration);
      const ease = 1 - Math.pow(1 - p, 3);
      const currAngle = (current + diff * ease) % 360;
      rawPointerAngleRef.current = currAngle;
      setAngle(currAngle);
      if (p < 1) {
        requestAnimationFrame(step);
      } else {
        setAngle(targetAngle);
        rawPointerAngleRef.current = targetAngle;
      }
    };
    requestAnimationFrame(step);
  };

  const handleStepDeg = (delta: number) => {
    setIsPlaying(false);
    const next = (angle + delta + 360) % 360;
    rawPointerAngleRef.current = next;
    setAngle(next);
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(document.documentElement.outerHTML);
      setCopiedHtml(true);
      setTimeout(() => setCopiedHtml(false), 2500);
    } catch {
      // fallback
    }
  };

  const handleDownloadStandaloneHtml = () => {
    const blob = new Blob([document.documentElement.outerHTML], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'moon_phase_simulator.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Space view coordinates: 지구와 달을 약간 왼편으로 이동(210)하여 우측 햇빛과의 여유 거리 확보
  const centerX = 210;
  const centerY = 250;
  const orbitRadius = 150;
  const earthRadius = 42;
  const moonRadius = 18;

  const angleRad = (angle * Math.PI) / 180;
  const moonX = centerX + orbitRadius * Math.cos(angleRad);
  const moonY = centerY - orbitRadius * Math.sin(angleRad);

  const obsX = centerX + earthRadius * Math.cos(angleRad);
  const obsY = centerY - earthRadius * Math.sin(angleRad);
  const obsRotationDeg = -angle;



  // Render high-fidelity Moon in Earth Observer View Canvas
  useEffect(() => {
    const canvas = moonCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const cx = width / 2;
    const cy = height / 2;
    const R = Math.min(cx, cy) - 20;

    ctx.clearRect(0, 0, width, height);

    // 1. Draw dark base (Earthshine disk in deep space)
    if (darkMoonCanvasRef.current) {
      ctx.drawImage(darkMoonCanvasRef.current, 0, 0);
    }

    // 2. Exact terminator clipping engine
    const normAngle = (angle % 360 + 360) % 360;
    const rad = (normAngle * Math.PI) / 180;

    if (litMoonCanvasRef.current) {
      if (normAngle > 0.5 && normAngle < 359.5) {
        ctx.save();
        ctx.beginPath();

        if (normAngle <= 180) {
          // Waxing (0° ~ 180°): Right side illuminated
          ctx.arc(cx, cy, R, -Math.PI / 2, Math.PI / 2, false);
          const rx = R * Math.abs(Math.cos(rad));
          if (normAngle < 90) {
            // 초승: curves right -> 6 to 12 via 3 o'clock (counter-clockwise = true)
            ctx.ellipse(cx, cy, rx, R, 0, Math.PI / 2, -Math.PI / 2, true);
          } else {
            // 상현~망: curves left -> 6 to 12 via 9 o'clock (clockwise = false)
            ctx.ellipse(cx, cy, rx, R, 0, Math.PI / 2, -Math.PI / 2, false);
          }
        } else {
          // Waning (180° ~ 360°): Left side illuminated
          ctx.arc(cx, cy, R, -Math.PI / 2, Math.PI / 2, true);
          const rx = R * Math.abs(Math.cos(rad));
          if (normAngle < 270) {
            // 망~하현: curves right -> 6 to 12 via 3 o'clock (counter-clockwise = true)
            ctx.ellipse(cx, cy, rx, R, 0, Math.PI / 2, -Math.PI / 2, true);
          } else {
            // 그믐: curves left -> 6 to 12 via 9 o'clock (clockwise = false)
            ctx.ellipse(cx, cy, rx, R, 0, Math.PI / 2, -Math.PI / 2, false);
          }
        }

        ctx.closePath();
        ctx.clip();
        ctx.drawImage(litMoonCanvasRef.current, 0, 0);
        ctx.restore();
      } else if (normAngle >= 179.5 && normAngle <= 180.5) {
        // Full moon
        ctx.drawImage(litMoonCanvasRef.current, 0, 0);
      }
    }

  }, [angle]);

  // Orbit CCW Arrow Tangents
  const orbitArrows = useMemo(() => {
    return [45, 135, 225, 315].map(deg => {
      const rad = (deg * Math.PI) / 180;
      const x = centerX + orbitRadius * Math.cos(rad);
      const y = centerY - orbitRadius * Math.sin(rad);
      const tangentDeg = (Math.atan2(-Math.cos(rad), -Math.sin(rad)) * 180) / Math.PI;
      return { deg, x, y, tangentDeg };
    });
  }, [centerX, centerY, orbitRadius]);

  return (
    <div className="flex flex-col h-screen h-[100dvh] w-screen bg-[#030712] text-slate-100 font-sans overflow-hidden select-none break-keep [word-break:keep-all]">
      {/* 1. Header (시각적 통일감: '중1 과학' 적용) */}
      <header className="shrink-0 bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 border-b border-slate-800/80 px-3 sm:px-4 py-2 sm:py-2.5 flex items-center justify-between z-20 shadow-md">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <span className="bg-sky-600 text-white text-[11px] sm:text-xs font-bold px-2 py-0.5 rounded shadow-sm">
              중1 과학
            </span>
            <span className="font-semibold text-slate-100 text-sm sm:text-base tracking-tight truncate">
              달의 공전과 위상 변화 시뮬레이터
            </span>
          </div>
          <span className="hidden xl:inline-flex text-xs text-slate-400 border-l border-slate-700/80 pl-3 items-center gap-1.5 shrink-0">
            <Globe className="w-3.5 h-3.5 text-sky-400" />
            우주 시점 및 지구 관측자 시점 실시간 비교 모델
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            onClick={handleCopyCode}
            title="단일 HTML 코드 복사"
            className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-md transition-all active:scale-95 shadow-sm"
          >
            {copiedHtml ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300">복사 완료</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-400" />
                <span className="hidden sm:inline">코드 복사</span>
              </>
            )}
          </button>

          <button
            onClick={handleDownloadStandaloneHtml}
            title="별도 설치 없이 어디서나 실행 가능한 단일 HTML 파일로 저장"
            className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 text-xs font-medium bg-sky-900/40 hover:bg-sky-800/60 text-sky-300 border border-sky-600/50 rounded-md transition-all active:scale-95 shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden md:inline">단일 HTML 다운로드</span>
            <span className="md:hidden">HTML</span>
          </button>

          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 text-xs font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-md transition-all active:scale-95 whitespace-nowrap"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>교과서 핵심 원리</span>
          </button>
        </div>
      </header>

      {/* 2. Simulation Viewports */}
      <main className="flex-1 grid grid-cols-1 md:grid-cols-2 relative bg-[#020617] min-h-0">
        {/* Dynamic Subtle Starfield Background */}
        <div
          className="absolute inset-0 pointer-events-none opacity-35"
          style={{
            backgroundImage: `
              radial-gradient(1.2px 1.2px at 25px 35px, #ffffff, transparent),
              radial-gradient(1.8px 1.8px at 140px 180px, #93c5fd, transparent),
              radial-gradient(1px 1px at 280px 70px, #ffffff, transparent),
              radial-gradient(2px 2px at 450px 320px, #e0f2fe, transparent),
              radial-gradient(1.2px 1.2px at 620px 140px, #ffffff, transparent),
              radial-gradient(1.8px 1.8px at 780px 290px, #fef08a, transparent),
              radial-gradient(1px 1px at 910px 80px, #ffffff, transparent),
              radial-gradient(1.8px 1.8px at 1100px 220px, #bfdbfe, transparent),
              radial-gradient(1.2px 1.2px at 1260px 420px, #ffffff, transparent)
            `,
            backgroundRepeat: 'repeat',
            backgroundSize: '700px 600px',
          }}
        />

        {/* Center Toast Notification */}
        <div
          className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 transition-all duration-300 pointer-events-none ${
            toastMessage ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
          }`}
        >
          <div className="flex items-center gap-3 px-5 py-3.5 rounded-xl bg-slate-900/95 backdrop-blur-md border border-amber-500/60 text-slate-100 shadow-2xl">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 animate-pulse" />
            <span className="text-xs sm:text-sm font-semibold tracking-tight">{toastMessage}</span>
          </div>
        </div>

        {/* Left: 우주 시점 */}
        <div className="relative w-full h-full overflow-hidden border-b md:border-b-0 md:border-r border-slate-800/80">
          {/* View Tag (태블릿 화면에서 우측 태양광 라벨과 겹치지 않도록 max-w 적용) */}
          <div className="absolute top-2.5 sm:top-3.5 left-2.5 sm:left-4 z-10 pointer-events-none bg-slate-900/85 backdrop-blur-md border border-slate-700/60 rounded-lg px-2.5 sm:px-3 py-1.5 shadow-lg max-w-[calc(100%-110px)] sm:max-w-xs">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full bg-sky-400 ring-2 ring-sky-500/30 shrink-0" />
              <span className="text-xs sm:text-sm font-bold text-slate-100 truncate">우주 관측 시점 (북극 상공)</span>
            </div>
            <p className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5 leading-tight">
              오른쪽에서 <strong className="text-sky-300">평행한 태양광 입사</strong> · 반시계 공전
            </p>
          </div>

          {/* 태양광 유입 영역 (그라데이션과 라벨은 항상 유지, 화살표만 토글) */}
          <div className="absolute top-0 right-0 bottom-0 w-28 sm:w-36 md:w-40 pointer-events-none z-10 flex flex-col justify-between py-5 pr-2.5 sm:pr-4 bg-gradient-to-l from-amber-500/20 via-amber-500/08 to-transparent">
            <div className="self-end mb-1">
              <span className="whitespace-nowrap inline-block text-[9.5px] sm:text-xs font-semibold tracking-tight bg-amber-950/85 border border-amber-500/40 text-amber-300/90 px-2 sm:px-2.5 py-0.5 rounded shadow-sm">
                ◀ 햇빛(태양광)
              </span>
            </div>

            {/* 8개의 고른 평행선: 화살표와 광선 (햇빛선 토글로 제어) */}
            <div className="flex-1 flex flex-col justify-around w-full items-end">
              {showSunlightRays && [0, 1, 2, 3, 4, 5, 6, 7].map(idx => (
                <div key={idx} className="flex items-center justify-end w-full">
                  {/* 부드럽고 작은 화살표 촉 */}
                  <span className="text-[10px] text-amber-300/80 leading-none select-none -mr-0.5">◀</span>
                  {/* 짧고 부드럽게 흐려지는 광선 줄기 */}
                  <div className="w-8 sm:w-12 h-[1.5px] bg-gradient-to-r from-amber-300/70 via-amber-400/35 to-transparent rounded-full" />
                </div>
              ))}
            </div>
          </div>

          {/* SVG Orbit and Celestial Objects */}
          <div className="w-full h-full flex items-center justify-center p-3 sm:p-5">
            <svg
              ref={svgRef}
              viewBox="0 0 500 500"
              className="w-full h-full max-w-[480px] max-h-[480px] touch-none cursor-grab active:cursor-grabbing"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              <defs>
                <radialGradient id="earth3d" cx="72%" cy="50%" r="65%">
                  <stop offset="0%" stopColor="#93c5fd" />
                  <stop offset="35%" stopColor="#2563eb" />
                  <stop offset="65%" stopColor="#1e3a8a" />
                  <stop offset="92%" stopColor="#090d16" />
                  <stop offset="100%" stopColor="#020408" />
                </radialGradient>

                <linearGradient id="moonSpaceLit" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#181a20" />
                  <stop offset="48%" stopColor="#2c303c" />
                  <stop offset="52%" stopColor="#e2e8f0" />
                  <stop offset="100%" stopColor="#ffffff" />
                </linearGradient>
              </defs>

              {/* 우주 공간 장식 별 */}
              <g fill="#ffffff" opacity="0.45">
                <circle cx="50" cy="80" r="1.2" />
                <circle cx="90" cy="140" r="1" />
                <circle cx="70" cy="380" r="1.5" />
                <circle cx="120" cy="440" r="1" />
                <circle cx="430" cy="60" r="1.2" />
                <circle cx="390" cy="420" r="1.5" />
                <circle cx="450" cy="350" r="1" />
                <circle cx="200" cy="50" r="1.2" />
              </g>

              {/* 1. 원형 공전 궤도선 (약간 왼편에 위치) */}
              <circle
                cx={centerX}
                cy={centerY}
                r={orbitRadius}
                fill="none"
                stroke="#253246"
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />

              {/* 반시계 방향 공전 궤도 화살표 */}
              {orbitArrows.map(({ deg, x, y, tangentDeg }) => (
                <g key={deg} transform={`translate(${x}, ${y}) rotate(${tangentDeg})`}>
                  <path
                    d="M -7 -4.5 L 5 0 L -7 4.5 L -4 0 Z"
                    fill="#60a5fa"
                    stroke="#3b82f6"
                    strokeWidth="0.8"
                  />
                </g>
              ))}

              {/* 2. 지구 (선명한 고대비 가독성 '지구' 뱃지 적용) */}
              <g transform={`translate(${centerX}, ${centerY})`}>
                <circle cx="0" cy="0" r={earthRadius + 4} fill="none" stroke="rgba(56, 189, 248, 0.25)" strokeWidth="4" />
                <circle cx="0" cy="0" r={earthRadius} fill="url(#earth3d)" />
                <path d="M -10 -14 Q 12 -22 20 -5 Q 15 15 -5 8 Z" fill="#10b981" opacity="0.6" />
                <path d="M -24 -8 Q -15 -30 0 -20 Q -15 -5 -24 -8 Z" fill="#059669" opacity="0.6" />
                <circle cx="0" cy="0" r="5" fill="#f8fafc" opacity="0.8" />
                <path
                  d={`M 0 ${-earthRadius} A ${earthRadius} ${earthRadius} 0 0 0 0 ${earthRadius} Z`}
                  fill="rgba(3, 7, 18, 0.75)"
                />

                {/* 가독성 대폭 향상된 '지구' 텍스트 뱃지 */}
                <g>
                  <rect
                    x="-18"
                    y="-9"
                    width="36"
                    height="18"
                    rx="4"
                    fill="rgba(15, 23, 42, 0.9)"
                    stroke="#38bdf8"
                    strokeWidth="1.2"
                  />
                  <text
                    x="0"
                    y="3.5"
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="bold"
                    fill="#ffffff"
                    pointerEvents="none"
                  >
                    지구
                  </text>
                </g>
              </g>

              {/* 3. 지구 표면 관측자 및 시선선 화살표 */}
              <g transform={`translate(${obsX}, ${obsY}) rotate(${obsRotationDeg})`}>
                {showSightline ? (
                  <>
                    {/* 시선선 켬: 지표면 관측자에서 달 표면 바로 앞까지 주황색 점선 연결 */}
                    <line
                      x1="4"
                      y1="0"
                      x2="81"
                      y2="0"
                      stroke="#f59e0b"
                      strokeWidth="1.8"
                      strokeDasharray="4 3"
                    />
                    {/* 원래 지면에 붙어 있던 주황색 화살표가 시선선 끝(달 표면 앞)으로 이동하여 달을 가리킴 */}
                    <path
                      d="M 81 -4.5 L 90 0 L 81 4.5 L 83 0 Z"
                      fill="#f59e0b"
                      stroke="#ffffff"
                      strokeWidth="0.6"
                    />
                  </>
                ) : (
                  <>
                    {/* 시선선 끔: 지면에 붙어 달 방향으로 ▶ 모양으로 지면에 붙어 있음 */}
                    <path
                      d="M 4 -4.5 L 13 0 L 4 4.5 L 6 0 Z"
                      fill="#f59e0b"
                      stroke="#ffffff"
                      strokeWidth="0.6"
                    />
                  </>
                )}
                {/* 지표면 관측자 위치 점 */}
                <circle cx="0" cy="0" r="3.5" fill="#f59e0b" stroke="#ffffff" strokeWidth="1" />
              </g>

              {/* 관측자 라벨 뱃지 */}
              <g transform={`translate(${obsX}, ${obsY})`}>
                <rect
                  x={Math.cos(angleRad) > 0 ? 12 : -58}
                  y={Math.sin(angleRad) > 0 ? -18 : 6}
                  width="46"
                  height="15"
                  rx="3"
                  fill="rgba(15, 23, 42, 0.85)"
                  stroke="#475569"
                  strokeWidth="0.8"
                />
                <text
                  x={Math.cos(angleRad) > 0 ? 35 : -35}
                  y={Math.sin(angleRad) > 0 ? -7 : 17}
                  textAnchor="middle"
                  className="text-[9px] fill-amber-300 font-bold"
                >
                  관측자
                </text>
              </g>

              {/* 4. 원형 궤도를 도는 달 (오른쪽 반구 항시 태양광 반사) */}
              <g
                transform={`translate(${moonX}, ${moonY})`}
                className="cursor-grab active:cursor-grabbing"
              >
                {/* 터치 및 드래그 영역 */}
                <circle cx="0" cy="0" r="32" fill="transparent" />

                {/* 달 구체 바탕 */}
                <circle cx="0" cy="0" r={moonRadius} fill="#1e293b" />
                {/* 오른쪽 반구 밝음 (태양광 반사) */}
                <path d={`M 0 ${-moonRadius} A ${moonRadius} ${moonRadius} 0 0 1 0 ${moonRadius} Z`} fill="#ffffff" />
                {/* 왼쪽 반구 어두움 (그림자) */}
                <path d={`M 0 ${-moonRadius} A ${moonRadius} ${moonRadius} 0 0 0 0 ${moonRadius} Z`} fill="#141820" />
                <circle cx="0" cy="0" r={moonRadius} fill="url(#moonSpaceLit)" opacity="0.9" />

                {/* 지구에서 관측되는 달의 면을 점선 직선으로 구분 (원을 반 자르는 형태) */}
                <g pointerEvents="none">
                  {/* 시인성 강화를 위한 어두운 그림자 선 */}
                  <line
                    x1={-moonRadius * Math.sin(angleRad)}
                    y1={-moonRadius * Math.cos(angleRad)}
                    x2={moonRadius * Math.sin(angleRad)}
                    y2={moonRadius * Math.cos(angleRad)}
                    stroke="rgba(0, 0, 0, 0.6)"
                    strokeWidth="2.8"
                    strokeDasharray="3 2"
                  />
                  {/* 지구 관측면 구분 점선 직선 */}
                  <line
                    x1={-moonRadius * Math.sin(angleRad)}
                    y1={-moonRadius * Math.cos(angleRad)}
                    x2={moonRadius * Math.sin(angleRad)}
                    y2={moonRadius * Math.cos(angleRad)}
                    stroke="#fbbf24"
                    strokeWidth="1.6"
                    strokeDasharray="3 2"
                  />
                </g>
              </g>
            </svg>
          </div>
        </div>

        {/* Right: 지구 관측자 시점 */}
        <div className="relative w-full h-full overflow-hidden flex items-center justify-center">
          {/* View Tag */}
          <div className="view-tag absolute top-2.5 sm:top-3.5 left-2.5 sm:left-4 z-10 pointer-events-none bg-slate-900/85 backdrop-blur-md border border-slate-700/60 rounded-lg px-2.5 sm:px-3.5 py-1.5 sm:py-2 shadow-lg">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full bg-amber-400 ring-2 ring-amber-500/30 shrink-0" />
              <span className="text-xs sm:text-sm font-bold text-slate-100">지구 관측자 시점</span>
            </div>
            <p className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5 leading-snug">
              지구 표면의 관측자가 밤하늘을 바라볼 때 보이는 달의 위상
            </p>
          </div>

          {/* Large Photorealistic Moon Canvas */}
          <div className="w-full h-full flex flex-col items-center justify-center p-2 sm:p-4 relative">
            <canvas
              ref={moonCanvasRef}
              width={440}
              height={440}
              className="w-full h-full max-w-[260px] sm:max-w-[320px] md:max-w-[350px] max-h-[260px] sm:max-h-[320px] md:max-h-[350px] object-contain drop-shadow-[0_0_45px_rgba(255,255,255,0.08)] mb-6 sm:mb-8 md:mb-10"
            />

            {/* 현재 관측 상황 통합 정보 카드 (한눈에 알아보기 쉬운 고가독성 디자인) */}
            <div className="absolute bottom-2 sm:bottom-3 md:bottom-4 left-1/2 -translate-x-1/2 w-[92%] max-w-sm pointer-events-none z-10">
              <div className="bg-slate-950/90 backdrop-blur-md border border-amber-500/50 rounded-xl sm:rounded-2xl px-3.5 py-2 sm:px-5 sm:py-2.5 shadow-[0_8px_30px_rgb(0,0,0,0.7)] flex flex-col items-center text-center gap-0.5 sm:gap-1 ring-1 ring-white/10">
                <div className="flex items-center gap-2 sm:gap-2.5">
                  <span className="text-xl sm:text-2xl md:text-3xl font-black text-amber-200 tracking-tight drop-shadow-[0_2px_10px_rgba(251,191,36,0.35)]">
                    {phaseInfo.name}
                  </span>
                  <span className="bg-sky-500/20 border border-sky-400/40 text-sky-300 text-[10px] sm:text-xs font-bold px-2 sm:px-2.5 py-0.5 rounded-full shadow-sm">
                    {phaseInfo.lunarDay}
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs md:text-[12.5px] text-slate-200 font-medium leading-snug">
                  {phaseInfo.desc}
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* 3. Footer Control UI Panel (태블릿 및 데스크톱 완벽 대응 반응형 그리드) */}
      <footer className="shrink-0 bg-slate-950/95 border-t border-slate-800/80 px-3 sm:px-4 md:px-5 py-2 sm:py-2.5 z-20 backdrop-blur-md">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2 sm:gap-2.5 lg:gap-3 items-center">
          {/* 1) 공전 제어 (모바일: 1열, 태블릿: 7컬럼, 데스크톱 lg: 3컬럼) */}
          <div className="col-span-1 md:col-span-7 lg:col-span-3 flex flex-col justify-center gap-1.5">
            <div className="flex items-center text-xs text-slate-300 font-semibold">
              <span className="flex items-center gap-1.5">
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                달의 공전 제어
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-md text-xs font-semibold transition-all ${
                  isPlaying
                    ? 'bg-sky-600 hover:bg-sky-500 text-white shadow-sm'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm'
                }`}
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{isPlaying ? '일시정지' : '자동 공전'}</span>
              </button>

              <button
                onClick={() => handleStepDeg(15)}
                title="15° 공전 진행"
                className="py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-md text-xs font-medium transition-all active:scale-95 shrink-0"
              >
                +15°
              </button>

              <button
                onClick={() => {
                  setIsPlaying(false);
                  rawPointerAngleRef.current = 0;
                  setAngle(0);
                }}
                title="삭(0도)으로 리셋"
                className="py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-md text-xs font-medium transition-all active:scale-95 shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* 공전 속도 슬라이더: 최대 2.0배로 제한 */}
            <div className="flex items-center gap-2 pt-0.5">
              <span className="text-[11px] text-slate-400 shrink-0">속도:</span>
              <input
                type="range"
                min="0.2"
                max="2.0"
                step="0.1"
                value={speedMultiplier}
                onChange={(e) => setSpeedMultiplier(parseFloat(e.target.value))}
                className="w-full accent-sky-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
              />
              <span className="text-[11px] font-mono text-sky-300 w-9 text-right shrink-0">
                {speedMultiplier.toFixed(1)}x
              </span>
            </div>
          </div>

          {/* 2) 달의 주요 위상 8단계 통합 프리셋 (태블릿 md에서는 12컬럼 상단 전체 배치하여 텍스트 잘림 원천 방지, 데스크톱 lg에서는 중앙 7컬럼) */}
          <div className="col-span-1 md:col-span-12 lg:col-span-7 md:order-first lg:order-none flex flex-col justify-center gap-1 sm:gap-1.5">
            <div className="text-xs text-slate-300 font-semibold flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-amber-400" />
                달의 주요 위상 (8단계)
              </span>
              <span className="text-[10px] text-slate-400 font-normal hidden sm:inline">
                버튼을 누르면 해당 위상으로 즉시 공전
              </span>
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-8 gap-1 sm:gap-1.5">
              {MAJOR_PHASES.map((preset) => {
                const isActive = phaseInfo.deg === preset.deg;
                return (
                  <button
                    key={preset.deg}
                    onClick={() => jumpToPreset(preset.deg)}
                    title={`${preset.name} (${preset.lunarDay}) - ${preset.deg}°`}
                    className={`py-1.5 sm:py-2 px-1 rounded-lg text-xs font-bold transition-all text-center flex flex-col items-center justify-center active:scale-95 shadow-sm ${
                      isActive
                        ? 'bg-amber-500 text-slate-950 ring-2 ring-amber-400 shadow-md font-extrabold'
                        : 'bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700'
                    }`}
                  >
                    <span className="truncate w-full text-[10px] sm:text-[11px] lg:text-[11.5px] font-bold leading-tight tracking-tight">
                      {preset.name === '상현~망 사이' ? '상현~망' : preset.name}
                    </span>
                    <span className={`text-[8.5px] sm:text-[9px] lg:text-[9.5px] font-medium leading-tight truncate w-full mt-0.5 tracking-tighter ${isActive ? 'text-slate-950 font-bold' : 'text-slate-400'}`}>
                      {preset.lunarDay}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3) 시각화 도구 (모바일: 1열, 태블릿: 5컬럼, 데스크톱 lg: 2컬럼) */}
          <div className="col-span-1 md:col-span-5 lg:col-span-2 flex flex-col justify-center gap-1.5">
            <div className="text-xs text-slate-300 font-semibold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              시각화 도구
            </div>

            <div className="grid grid-cols-2 gap-1 sm:gap-1.5">
              <button
                onClick={() => setShowSightline(!showSightline)}
                className={`py-1.5 px-1.5 rounded-md text-[11px] sm:text-xs font-semibold transition-all border text-center active:scale-95 whitespace-nowrap ${
                  showSightline
                    ? 'bg-sky-600/35 text-sky-200 border-sky-400 shadow-sm ring-1 ring-sky-400/30 font-bold'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                }`}
              >
                {showSightline ? '시선선 켬' : '시선선 끔'}
              </button>

              <button
                onClick={() => setShowSunlightRays(!showSunlightRays)}
                className={`py-1.5 px-1.5 rounded-md text-[11px] sm:text-xs font-semibold transition-all border text-center active:scale-95 whitespace-nowrap ${
                  showSunlightRays
                    ? 'bg-amber-600/35 text-amber-200 border-amber-500 shadow-sm ring-1 ring-amber-400/30 font-bold'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                }`}
              >
                {showSunlightRays ? '햇빛선 켬' : '햇빛선 끔'}
              </button>
            </div>
            <span className="text-[10px] text-slate-400 leading-tight hidden xl:block truncate">
              반시계 방향 드래그
            </span>
          </div>
        </div>
      </footer>

      {/* 4. Educational Modal ('중1 과학' 적용) */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-slate-900 border border-slate-700/80 rounded-xl max-w-2xl w-full p-6 shadow-2xl text-slate-200 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="bg-sky-600 text-white text-xs font-bold px-2 py-0.5 rounded">중1 과학</span>
                <h2 className="text-lg font-bold text-slate-100">달의 공전과 위상 변화 핵심 모델</h2>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-100 text-xl font-bold p-1 leading-none transition-colors"
                title="닫기"
              >
                &times;
              </button>
            </div>

            <div className="space-y-4 text-sm mt-4 leading-relaxed">
              <div className="bg-sky-950/40 border border-sky-800/60 p-3.5 rounded-lg">
                <h4 className="font-bold text-sky-300 mb-1">핵심 원리 한 줄 요약:</h4>
                <p className="text-xs text-sky-100">
                  달은 스스로 빛을 내지 못하고 <strong>태양빛을 반사</strong>합니다. 우주 공간에서 보면 달은 언제나 태양을 향한 <strong>절반만 빛나고 있지만</strong>, 달이 지구 주위를 <strong>시계 반대 방향(서→동)</strong>으로 공전함에 따라 지구의 관측자가 바라보는 밝은 면의 비율이 달라져 위상이 변화합니다.
                </p>
              </div>

              <div>
                <h3 className="font-bold text-slate-100 text-base mb-2">1. 우주 관측 시점 vs 지구 관측자 시점</h3>
                <ul className="list-disc pl-5 space-y-1 text-xs text-slate-300">
                  <li><strong>우주 관측 시점:</strong> 아주 먼 오른쪽에서 평행한 태양광이 들어오므로, 지구와 달은 항상 <strong>오른쪽 반구만 조명</strong>을 받습니다.</li>
                  <li><strong>지구 관측자 시점:</strong> 지구 표면의 관측자 위치에서 달을 올려다보았을 때 보이는 조명된 영역(명암 경계선)의 2D 모습입니다.</li>
                  <li><strong>공전 방향:</strong> 북극 상공에서 내려다볼 때 달은 지구 주위를 반드시 <strong>시계 반대 방향</strong>으로 공전합니다.</li>
                </ul>
              </div>

              <div>
                <h3 className="font-bold text-slate-100 text-base mb-2">2. 주요 8대 위상과 음력 일자</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2 text-xs">
                  <div className="bg-slate-800/80 p-3 rounded-md border border-slate-700">
                    <strong className="text-amber-400 block mb-1">삭 (음력 1일, 0°):</strong>
                    달이 지구와 태양 사이에 위치하여 어두운 면만 지구를 향해 보이지 않습니다.
                  </div>
                  <div className="bg-slate-800/80 p-3 rounded-md border border-slate-700">
                    <strong className="text-amber-400 block mb-1">초승 (음력 2~3일, 45°):</strong>
                    오른쪽 눈썹 모양으로 일몰 후 서쪽 하늘에서 짧은 시간 관측됩니다.
                  </div>
                  <div className="bg-slate-800/80 p-3 rounded-md border border-slate-700">
                    <strong className="text-amber-400 block mb-1">상현 (음력 7~8일, 90°):</strong>
                    오른쪽 절반이 밝은 D자형 반달로, 초저녁 남쪽 하늘에서 자정 무렵 서쪽으로 집니다.
                  </div>
                  <div className="bg-slate-800/80 p-3 rounded-md border border-slate-700">
                    <strong className="text-amber-400 block mb-1">상현~망 사이 (음력 11~12일, 135°):</strong>
                    상현달을 지나 보름달을 향해 오른쪽부터 차오르는 볼록한 달(차오르는 달)입니다.
                  </div>
                  <div className="bg-slate-800/80 p-3 rounded-md border border-slate-700">
                    <strong className="text-amber-400 block mb-1">망 / 보름달 (음력 15일, 180°):</strong>
                    달의 조명된 전면이 지구를 향해 완전히 둥근 보름달로 밤새도록 빛납니다.
                  </div>
                  <div className="bg-slate-800/80 p-3 rounded-md border border-slate-700">
                    <strong className="text-amber-400 block mb-1">망~하현 사이 (음력 18~19일, 225°):</strong>
                    보름달을 지나 오른쪽부터 이지러져 왼쪽 부분이 볼록한 달(이지러지는 달)입니다.
                  </div>
                  <div className="bg-slate-800/80 p-3 rounded-md border border-slate-700">
                    <strong className="text-amber-400 block mb-1">하현 (음력 22~23일, 270°):</strong>
                    왼쪽 절반이 밝은 역D자형 반달로, 자정에 동쪽에서 떠 아침 출근길 서쪽 하늘에 보입니다.
                  </div>
                  <div className="bg-slate-800/80 p-3 rounded-md border border-slate-700">
                    <strong className="text-amber-400 block mb-1">그믐 (음력 27~28일, 315°):</strong>
                    왼쪽 가장자리만 가늘게 남아 일출 직전 새벽 동쪽 하늘에서 잠시 관측됩니다.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
