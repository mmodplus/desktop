import { useEffect, useRef, useState } from "react";
import { motion, useAnimationControls } from "framer-motion";

const CAT_BODY = "#0d0d10";
const CAT_OUTLINE = "rgba(255, 255, 255, 0.16)";
const CAT_EYE = "#d9f26b";
const CAT_PINK = "#ff8fa3";
const LEFT_EYE = { cx: 17, cy: 19 };
const RIGHT_EYE = { cx: 31, cy: 19 };
// how far a pupil travels inside its eye, in viewBox units
const PUPIL_REACH = { x: 1.8, y: 1.2 };
const PUPIL_SPRING = { type: "spring", stiffness: 260, damping: 20 } as const;
const GLANCES = [
  { x: 0, y: 0 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: -0.7, y: -0.6 },
  { x: 0.7, y: -0.6 },
  { x: 0, y: 0.7 },
];

const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);

/** the hidden overlay, sometimes: a cat peeking over the screen edge that blinks and looks around */
export function OverlayCat({ hovered }: { hovered: boolean }) {
  const blink = useAnimationControls();
  const svgRef = useRef<SVGSVGElement>(null);
  const [glance, setGlance] = useState(GLANCES[0]);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(async () => {
        // now and then a double blink
        const times = Math.random() < 0.2 ? 2 : 1;
        for (let i = 0; i < times; i++) {
          await blink.start({
            scaleY: [1, 0.08, 1],
            transition: { duration: 0.16, ease: "easeInOut" },
          });
        }
        schedule();
      }, randomBetween(2200, 5200));
    };
    schedule();
    return () => {
      clearTimeout(timer);
      blink.stop();
    };
  }, [blink]);

  useEffect(() => {
    if (hovered) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        setGlance(GLANCES[Math.floor(Math.random() * GLANCES.length)]);
        schedule();
      }, randomBetween(1400, 3600));
    };
    schedule();
    return () => clearTimeout(timer);
  }, [hovered]);

  useEffect(() => {
    if (!hovered) return;
    const onMove = (event: MouseEvent) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const dx = (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
      const dy = (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
      setCursor({
        x: Math.max(-1, Math.min(1, dx)),
        y: Math.max(-1, Math.min(1, dy)),
      });
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [hovered]);

  // follows the cursor while hovered, otherwise looks around on its own
  const look = (hovered && cursor) || glance;
  const pupil = {
    x: look.x * PUPIL_REACH.x,
    y: look.y * PUPIL_REACH.y,
    // curious when hovered: the pupils open up
    scaleX: hovered ? 1.9 : 1,
  };

  const eye = (center: { cx: number; cy: number }) => (
    <motion.g
      animate={blink}
      style={{ transformBox: "fill-box", transformOrigin: "center" }}
    >
      <ellipse cx={center.cx} cy={center.cy} rx={4.2} ry={4.6} fill={CAT_EYE} />
      <motion.ellipse
        cx={center.cx}
        cy={center.cy}
        rx={1.3}
        ry={3.5}
        fill={CAT_BODY}
        initial={false}
        animate={pupil}
        transition={PUPIL_SPRING}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      />
      <circle cx={center.cx + 1.4} cy={center.cy - 1.8} r={0.8} fill="#fff" opacity={0.85} />
    </motion.g>
  );

  return (
    <svg
      ref={svgRef}
      width={48}
      height={34}
      viewBox="0 0 48 34"
      fill="none"
      aria-hidden="true"
      className="pointer-events-none overflow-visible"
    >
      <motion.path
        d="M7 16 L9.5 2.5 L19 9.5 Z"
        fill={CAT_BODY}
        stroke={CAT_OUTLINE}
        strokeLinejoin="round"
        animate={{ rotate: hovered ? -8 : 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 14 }}
        style={{ transformBox: "fill-box", transformOrigin: "bottom right" }}
      />
      <motion.path
        d="M41 16 L38.5 2.5 L29 9.5 Z"
        fill={CAT_BODY}
        stroke={CAT_OUTLINE}
        strokeLinejoin="round"
        animate={{ rotate: hovered ? 8 : 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 14 }}
        style={{ transformBox: "fill-box", transformOrigin: "bottom left" }}
      />
      <path d="M10 6 L11.2 12 L15.5 9.6 Z" fill={CAT_PINK} opacity={0.35} />
      <path d="M38 6 L36.8 12 L32.5 9.6 Z" fill={CAT_PINK} opacity={0.35} />
      <ellipse cx={24} cy={20.5} rx={18} ry={12.5} fill={CAT_BODY} stroke={CAT_OUTLINE} />

      {eye(LEFT_EYE)}
      {eye(RIGHT_EYE)}

      <path d="M22.6 24.6 L25.4 24.6 L24 26.2 Z" fill={CAT_PINK} />
      <path
        d="M24 26.2 Q22.8 28 21.4 27.2 M24 26.2 Q25.2 28 26.6 27.2"
        stroke="rgba(255, 255, 255, 0.35)"
        strokeWidth={0.8}
        strokeLinecap="round"
      />
      <g stroke="rgba(255, 255, 255, 0.22)" strokeWidth={0.7} strokeLinecap="round">
        <path d="M14 24.5 L3 23" />
        <path d="M14 26 L3.5 27.5" />
        <path d="M34 24.5 L45 23" />
        <path d="M34 26 L44.5 27.5" />
      </g>
    </svg>
  );
}

export default OverlayCat;
