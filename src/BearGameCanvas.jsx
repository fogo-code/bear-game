import { useEffect, useRef, useState } from 'react';
import db from './firebase';
import { ref, set, onValue, remove, get } from 'firebase/database';
import { v4 as uuidv4 } from 'uuid';

export default function BearGameCanvas() {
  const canvasRef = useRef(null);
  const playerId = useRef(
    localStorage.getItem("bearPlayerId") || (() => {
      const id = uuidv4();
      localStorage.setItem("bearPlayerId", id);
      return id;
    })()
  );
  const playerRef = useRef({ x: 300, y: 300, radius: 40, speed: 2, angle: 0, health: 100 });
  const otherPlayersRef = useRef({});
  const keys = useRef({});
  const clawTimeRef = useRef(0);
  const mousePosRef = useRef({ x: 0, y: 0 });
  const slashPosRef = useRef({ x: 0, y: 0, angle: 0 });
  const bearImgRef = useRef(new Image());
  const bearLoadedRef = useRef(false);
  const chatMessageRef = useRef(null);
  const chatTimerRef = useRef(0);
  const [inputValue, setInputValue] = useState("");

  const syncToFirebase = () => {
    const p = playerRef.current;
    const data = {
      x: p.x,
      y: p.y,
      angle: p.angle ?? 0,
      health: p.health,
      chat: chatMessageRef.current || "",
      username: "Player"
    };
    set(ref(db, `players/${playerId.current}`), data);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const localPlayerId = playerId.current;
    const ctx = canvas.getContext("2d");

    bearImgRef.current.src = process.env.PUBLIC_URL + "/bear.png";
    bearImgRef.current.onload = () => {
      bearLoadedRef.current = true;
      playerRef.current.angle = 0;
      setTimeout(() => {
        syncToFirebase();
      }, 100);
    };

    mousePosRef.current.x = playerRef.current.x + 1;
    mousePosRef.current.y = playerRef.current.y;

    const handleKeyDown = (e) => {
      keys.current[e.key] = true;
    };

    const handleKeyUp = (e) => {
      keys.current[e.key] = false;
    };

    const handleMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      mousePosRef.current.x = e.clientX - rect.left;
      mousePosRef.current.y = e.clientY - rect.top;
    };

    const handleClick = () => {
      const player = playerRef.current;
      const mouse = mousePosRef.current;
      const angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
      slashPosRef.current = {
        x: player.x + Math.cos(angle) * (player.radius + 5),
        y: player.y + Math.sin(angle) * (player.radius + 5),
        angle
      };
      clawTimeRef.current = 10;

      Object.entries(otherPlayersRef.current).forEach(([id, other]) => {
        const dx = other.x - slashPosRef.current.x;
        const dy = other.y - slashPosRef.current.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 40) {
          const targetHealthRef = ref(db, `players/${id}/health`);
          set(targetHealthRef, Math.max(0, other.health - 10));

          // Knockback
          const knockbackDist = 10;
          const knockbackX = other.x + Math.cos(angle) * knockbackDist;
          const knockbackY = other.y + Math.sin(angle) * knockbackDist;
          set(ref(db, `players/${id}/x`), knockbackX);
          set(ref(db, `players/${id}/y`), knockbackY);
        }
      });
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("click", handleClick);

    const playersRef = ref(db, 'players');
    onValue(playersRef, (snapshot) => {
      const data = snapshot.val() || {};
      delete data[localPlayerId];
      otherPlayersRef.current = data;
    });

    const update = () => {
      const { speed } = playerRef.current;
      let x = playerRef.current.x;
      let y = playerRef.current.y;

      if (keys.current["w"] || keys.current["ArrowUp"]) y -= speed;
      if (keys.current["s"] || keys.current["ArrowDown"]) y += speed;
      if (keys.current["a"] || keys.current["ArrowLeft"]) x -= speed;
      if (keys.current["d"] || keys.current["ArrowRight"]) x += speed;

      playerRef.current.x = x;
      playerRef.current.y = y;

      const dx = mousePosRef.current.x - x;
      const dy = mousePosRef.current.y - y;
      const rawAngle = Math.atan2(dy, dx);
      playerRef.current.angle = Math.round(rawAngle * 10000) / 10000;

      if (clawTimeRef.current > 0) {
        clawTimeRef.current -= 1;
      }

      if (chatTimerRef.current > 0) {
        chatTimerRef.current--;
      } else {
        chatMessageRef.current = null;
      }

      syncToFirebase();
    };

    const drawClaw = (ctx, x, y, angle) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.strokeStyle = 'silver';
      ctx.lineWidth = 2;

      for (let i = 0; i < 3; i++) {
        const offsetY = -10 + i * 10;
        ctx.beginPath();
        ctx.moveTo(0, offsetY);
        ctx.lineTo(25, offsetY - 5);
        ctx.stroke();
      }

      ctx.restore();
    };

    const drawGrassTexture = (ctx, width, height) => {
      const patternCanvas = document.createElement("canvas");
      patternCanvas.width = 20;
      patternCanvas.height = 20;
      const pctx = patternCanvas.getContext("2d");

      pctx.fillStyle = '#355e3b';
      pctx.fillRect(0, 0, 20, 20);

      pctx.strokeStyle = '#4c9a2a';
      pctx.beginPath();
      pctx.moveTo(0, 10);
      pctx.lineTo(20, 10);
      pctx.stroke();

      pctx.strokeStyle = '#3f7d20';
      pctx.beginPath();
      pctx.moveTo(10, 0);
      pctx.lineTo(10, 20);
      pctx.stroke();

      const pattern = ctx.createPattern(patternCanvas, 'repeat');
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, width, height);
    };

    const drawBear = (x, y, chat, username, angle = 0, health = 100) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle - Math.PI / 2);
      ctx.drawImage(bearImgRef.current, -40, -40, 80, 80);
      ctx.restore();

      if (username) {
        ctx.font = "14px Arial";
        ctx.fillStyle = "yellow";
        ctx.textAlign = "center";
        ctx.fillText(username, x, y - 60);
      }

      if (chat) {
        ctx.font = "16px Arial";
        ctx.fillStyle = "white";
        ctx.textAlign = "center";
        ctx.fillText(chat, x, y - 40);
      }

      ctx.fillStyle = "red";
      ctx.fillRect(x - 40, y - 70, 80, 5);
      ctx.fillStyle = "lime";
      ctx.fillRect(x - 40, y - 70, (health / 100) * 80, 5);
    };

    const draw = () => {
      const ctx = canvas.getContext("2d");
      drawGrassTexture(ctx, canvas.width, canvas.height);

      if (bearLoadedRef.current) {
        drawBear(
          playerRef.current.x,
          playerRef.current.y,
          chatMessageRef.current,
          "You",
          playerRef.current.angle,
          playerRef.current.health
        );
        Object.values(otherPlayersRef.current).forEach(player => {
          drawBear(player.x, player.y, player.chat, player.username, player.angle, player.health);
        });
      }

      if (clawTimeRef.current > 0) {
        const { x: sx, y: sy, angle: slashAngle } = slashPosRef.current;
        drawClaw(ctx, sx, sy, slashAngle);
      }
    };

    const gameLoop = () => {
      update();
      draw();
      requestAnimationFrame(gameLoop);
    };

    gameLoop();

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("click", handleClick);
      remove(ref(db, `players/${localPlayerId}`));
    };
  }, []);

  const handleChatSubmit = (e) => {
    e.preventDefault();
    if (inputValue.trim() !== "") {
      chatMessageRef.current = inputValue.trim();
      chatTimerRef.current = 180;
      setInputValue("");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-green-900">
      <canvas
        ref={canvasRef}
        width={800}
        height={600}
        className="border border-black rounded-lg"
      ></canvas>
      <form onSubmit={handleChatSubmit} className="mt-4">
        <input
          type="text"
          className="p-2 rounded border border-gray-400"
          placeholder="Type your message..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
        />
        <button
          type="submit"
          className="ml-2 px-4 py-2 bg-blue-500 text-white rounded"
        >
          Send
        </button>
      </form>
    </div>
  );
}
