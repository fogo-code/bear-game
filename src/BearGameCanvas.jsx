import { useEffect, useRef, useState } from 'react';
import db from './firebase';
import { ref, set, onValue, remove } from 'firebase/database';
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
  const playerRef = useRef({ x: 300, y: 300, radius: 40, speed: 2 });
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
  const [username, setUsername] = useState(
    localStorage.getItem("bearUsername") || ""
  );

  useEffect(() => {
    if (!username) {
      const name = prompt("Enter your bear name:");
      setUsername(name);
      localStorage.setItem("bearUsername", name);
    }
  }, []);

  const syncToFirebase = () => {
    const p = playerRef.current;
    set(ref(db, `players/${playerId.current}`), {
      x: p.x,
      y: p.y,
      chat: chatMessageRef.current || "",
      username
    });
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const localPlayerId = playerId.current;
    const ctx = canvas.getContext("2d");

    bearImgRef.current.src = process.env.PUBLIC_URL + "/bear.png";
    bearImgRef.current.onload = () => {
      bearLoadedRef.current = true;
    };

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
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("click", handleClick);

    const playersRef = ref(db, 'players');
    onValue(playersRef, (snapshot) => {
      const data = snapshot.val() || {};
      const updatedPlayers = {};
      for (const id in data) {
        if (data[id] && id !== localPlayerId && data[id].username) {
          updatedPlayers[id] = data[id];
        }
      }
      otherPlayersRef.current = updatedPlayers;
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

    const draw = () => {
      const ctx = canvas.getContext("2d");
      drawGrassTexture(ctx, canvas.width, canvas.height);

      const drawBear = (x, y, chat, username) => {
        const angle = Math.atan2(mousePosRef.current.y - y, mousePosRef.current.x - x);
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
      };

      if (bearLoadedRef.current) {
        drawBear(playerRef.current.x, playerRef.current.y, chatMessageRef.current, username);
        Object.values(otherPlayersRef.current).forEach(player => {
          drawBear(player.x, player.y, player.chat, player.username);
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
  }, [username]);

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
// trigger redeploy
// redeploy trigger
// redeploy
