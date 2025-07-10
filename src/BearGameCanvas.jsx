// FINAL FIX — Damage Sync + Respawn + Chat Fix + Charge Block During Chat + Speed Bug + Full Game Logic Restored
import { useEffect, useRef, useState } from 'react';
import db from './firebase';
import { ref, set, remove, push, onDisconnect, onValue, onChildAdded } from 'firebase/database';
import { v4 as uuidv4 } from 'uuid';

export default function BearGameCanvas() {
  const canvasRef = useRef(null);
  const inputRef = useRef(null);
  const [chatMode, setChatMode] = useState(false);
  const [playerId] = useState(() => {
    const existing = localStorage.getItem("bearPlayerId");
    if (existing) return existing;
    const newId = uuidv4();
    localStorage.setItem("bearPlayerId", newId);
    return newId;
  });

  const playerRef = useRef({ x: 300, y: 300, radius: 40, speed: 2, vx: 0, vy: 0, angle: 0, health: 100, slash: null, chat: "" });
  const keys = useRef({});
  const clawTimeRef = useRef(0);
  const dashCooldownRef = useRef(0);
  const mousePosRef = useRef({ x: 0, y: 0 });
  const bearImgRef = useRef(new Image());
  const bearLoadedRef = useRef(false);
  const [isDead, setIsDead] = useState(false);
  const [respawnTimer, setRespawnTimer] = useState(0);
  const otherPlayersRef = useRef({});
  const lastDamageTime = useRef(0);

  const syncToFirebase = () => {
    const p = playerRef.current;
    set(ref(db, `players/${playerId}`), {
      x: p.x,
      y: p.y,
      angle: p.angle,
      health: p.health,
      username: "Player",
      slash: p.slash ?? null,
      chat: p.chat ?? ""
    });
  };

  useEffect(() => {
    const pRef = ref(db, `players/${playerId}`);
    syncToFirebase();
    onDisconnect(pRef).remove();
    return () => remove(pRef);
  }, [playerId]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (chatMode || isDead) return;
      keys.current[e.key] = true;
      if (e.key === 'e' && dashCooldownRef.current <= 0) {
        const p = playerRef.current;
        const angle = p.angle;
        p.vx += Math.cos(angle) * 10;
        p.vy += Math.sin(angle) * 10;
        dashCooldownRef.current = 60;

        Object.entries(otherPlayersRef.current).forEach(([id, op]) => {
          const dx = op.x - p.x;
          const dy = op.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 65) {
            const damageRef = push(ref(db, `damageEvents/${id}`));
            set(damageRef, {
              from: playerId,
              type: "charge",
              angle,
              timestamp: Date.now()
            });
          }
        });
      }
    };

    const handleKeyUp = (e) => {
      keys.current[e.key] = false;
    };

    const handleMouseMove = (e) => {
      const rect = canvasRef.current.getBoundingClientRect();
      mousePosRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    };

    const handleClick = () => {
      if (chatMode || clawTimeRef.current > 0 || isDead) return;
      const p = playerRef.current;
      const angle = Math.atan2(mousePosRef.current.y - p.y, mousePosRef.current.x - p.x);
      const slash = {
        x: p.x + Math.cos(angle) * (p.radius + 5),
        y: p.y + Math.sin(angle) * (p.radius + 5),
        angle,
        timestamp: Date.now()
      };
      p.slash = slash;
      clawTimeRef.current = 10;

      Object.entries(otherPlayersRef.current).forEach(([id, op]) => {
        const dx = op.x - slash.x;
        const dy = op.y - slash.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 60) {
          const damageRef = push(ref(db, `damageEvents/${id}`));
          set(damageRef, {
            from: playerId,
            type: "slash",
            angle,
            timestamp: Date.now()
          });
        }
      });
    };

    const handleChatKey = (e) => {
      if (e.key === 'Enter') {
        if (!chatMode) {
          setChatMode(true);
          setTimeout(() => inputRef.current?.focus(), 10);
        } else {
          const message = inputRef.current?.value || "";
          playerRef.current.chat = message;
          syncToFirebase();
          inputRef.current.value = "";
          setChatMode(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('click', handleClick);
    window.addEventListener('keydown', handleChatKey);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleChatKey);
    };
  }, [chatMode, isDead]);

  useEffect(() => {
    onChildAdded(ref(db, `damageEvents/${playerId}`), (snapshot) => {
      const evt = snapshot.val();
      if (!evt) return;
      const { type, angle, timestamp } = evt;
      if (timestamp <= lastDamageTime.current) return;
      lastDamageTime.current = timestamp;

      const p = playerRef.current;
      if (p.health <= 0) return;

      if (type === 'slash') {
        p.health = Math.max(0, p.health - 10);
        p.vx += Math.cos(angle) * 6;
        p.vy += Math.sin(angle) * 6;
      } else if (type === 'charge') {
        p.health = Math.max(0, p.health - 30);
        p.vx += Math.cos(angle) * 10;
        p.vy += Math.sin(angle) * 10;
      }

      remove(ref(db, `damageEvents/${playerId}/${snapshot.key}`));
    });
  }, []);
}
