(function() {
    "use strict";

    /* ========== PHÁO HOA - CANVAS ========== */
    const canvas = document.getElementById("fireworks-canvas");
    const ctx = canvas ? canvas.getContext("2d") : null;
    let width = window.innerWidth;
    let height = window.innerHeight;

    function resizeCanvas() {
        width = window.innerWidth;
        height = window.innerHeight;
        if (canvas) {
            canvas.width = width;
            canvas.height = height;
        }
    }
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    // Màu pháo hoa (mỗi lần nổ random từ bảng màu)
    const fireworkColors = [
        "#ff1a1a", "#ff4d4d", "#ff8c00", "#ffd700", "#ff66b2",
        "#ff66cc", "#ffcc66", "#ff3366", "#ff0077", "#ffb6c1",
        "#ff4500", "#ff2d2d", "#ff8da1"
    ];

    function randomColor() {
        return fireworkColors[Math.floor(Math.random() * fireworkColors.length)];
    }

    // Simple WebAudio-based firework sound (synthesized noise + thump)
    function getAudioCtx() {
        if (!window._fwAudioCtx) {
            try {
                window._fwAudioCtx = new(window.AudioContext || window.webkitAudioContext)();
            } catch (e) {
                console.warn("WebAudio not supported", e);
            }
        }
        return window._fwAudioCtx;
    }

    function playFireworkSound(volume = 0.7) {
        const audioCtx = getAudioCtx();
        if (!audioCtx) return;
        try {
            const duration = 1.0 + Math.random() * 0.6;
            const sampleRate = audioCtx.sampleRate;
            const bufferSize = Math.floor(sampleRate * duration);
            const buffer = audioCtx.createBuffer(1, bufferSize, sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                const t = i / sampleRate;
                // decaying noise
                const decay = Math.pow(1 - t / duration, 2.5);
                data[i] = (Math.random() * 2 - 1) * decay * (0.6 + Math.random() * 0.4);
            }
            const src = audioCtx.createBufferSource();
            src.buffer = buffer;
            const hp = audioCtx.createBiquadFilter();
            hp.type = 'highpass';
            // use higher cutoff so the noise sounds brighter/sizzlier
            hp.frequency.value = 1200 + Math.random() * 1200;
            const gain = audioCtx.createGain();
            gain.gain.value = volume * 0.6;
            src.connect(hp);
            hp.connect(gain);
            gain.connect(audioCtx.destination);
            const now = audioCtx.currentTime;
            src.start(now);
            src.stop(now + duration);

            // sharp "xéo" whistle (short high-pitched chirp)
            try {
                const whistle = audioCtx.createOscillator();
                const whistleGain = audioCtx.createGain();
                whistle.type = 'sawtooth';
                // start fairly high and sweep up quickly for a slicing whistle
                const startFreq = 800 + Math.random() * 400;
                const endFreq = 3000 + Math.random() * 3000;
                whistle.frequency.setValueAtTime(startFreq, now);
                whistle.frequency.exponentialRampToValueAtTime(endFreq, now + 0.08);

                whistleGain.gain.setValueAtTime(0.0001, now);
                whistleGain.gain.linearRampToValueAtTime(volume * 0.06, now + 0.01);
                whistleGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18 + Math.random() * 0.08);

                // mild bandpass to focus the whistle tone
                const bp = audioCtx.createBiquadFilter();
                bp.type = 'bandpass';
                bp.frequency.value = (startFreq + endFreq) / 2;
                bp.Q.value = 6;

                whistle.connect(bp);
                bp.connect(whistleGain);
                whistleGain.connect(audioCtx.destination);

                whistle.start(now);
                whistle.stop(now + 0.22 + Math.random() * 0.06);
            } catch (e) {
                // non-fatal
            }

            // sub-bass thump
            const osc = audioCtx.createOscillator();
            const oscGain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.value = 60 + Math.random() * 60;
            osc.connect(oscGain);
            oscGain.connect(audioCtx.destination);
            oscGain.gain.setValueAtTime(volume * 0.001, now);
            oscGain.gain.linearRampToValueAtTime(volume * 0.9, now + 0.02);
            oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6 + Math.random() * 0.3);
            osc.start(now);
            osc.stop(now + 0.8);
        } catch (e) {
            console.warn('playFireworkSound error', e);
        }
    }

    /**
     * Lớp Particle - một hạt sau khi pháo nổ
     */
    class Particle {
        constructor(x, y, color, velocity, gravity, friction, fade) {
            this.x = x;
            this.y = y;
            this.color = color;
            this.vx = velocity.x;
            this.vy = velocity.y;
            this.gravity = gravity;
            this.friction = friction;
            this.alpha = 1;
            this.fade = fade;
            this.radius = Math.random() * 1.5 + 0.5;
        }

        update() {
            this.vy += this.gravity;
            this.vx *= this.friction;
            this.vy *= this.friction;
            this.x += this.vx;
            this.y += this.vy;
            this.alpha -= this.fade;
        }

        draw() {
            ctx.save();
            ctx.globalAlpha = Math.max(0, this.alpha);
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        isDead() {
            return this.alpha <= 0;
        }
    }

    /**
     * Lớp Firework - pháo bay lên rồi nổ thành particles
     */
    class Firework {
        constructor() {
            // spawn across full width for richer effect
            this.x = Math.random() * width;
            this.y = height;
            // targetY closer to top (smaller value) -> fireworks explode higher
            this.targetY = Math.random() * height * 0.25 + height * 0.05;
            // stronger initial upward velocity so fireworks reach higher faster
            this.vy = -Math.random() * 4 - 12;
            this.vx = (Math.random() - 0.5) * 2;
            this.color = randomColor();
            this.particles = [];
            this.exploded = false;
            this.trail = [];
        }

        update() {
            if (!this.exploded) {
                this.vy += 0.25;
                this.vx *= 0.98;
                this.x += this.vx;
                this.y += this.vy;
                this.trail.push({ x: this.x, y: this.y, alpha: 1 });
                if (this.trail.length > 30) this.trail.shift();

                if (this.vy >= 0 || this.y <= this.targetY) {
                    this.explode();
                }
            } else {
                for (let i = this.particles.length - 1; i >= 0; i--) {
                    this.particles[i].update();
                    if (this.particles[i].isDead()) {
                        this.particles.splice(i, 1);
                    }
                }
            }
        }

        explode() {
            this.exploded = true;
            // play sound on explosion (synthesized) — quieter
            try {
                playFireworkSound((0.8 + Math.random() * 0.6) * 0.25);
            } catch (e) {}
            const count = 60 + Math.floor(Math.random() * 40);
            for (let i = 0; i < count; i++) {
                const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
                const speed = 2 + Math.random() * 6;
                const vx = Math.cos(angle) * speed;
                const vy = Math.sin(angle) * speed;
                this.particles.push(new Particle(
                    this.x,
                    this.y,
                    this.color, { x: vx, y: vy },
                    0.08,
                    0.98,
                    0.015 + Math.random() * 0.01
                ));
            }
        }

        draw() {
            if (!this.exploded) {
                ctx.save();
                ctx.strokeStyle = this.color;
                ctx.lineWidth = 2;
                const trailLen = this.trail.length;
                for (let i = 0; i < trailLen - 1; i++) {
                    ctx.globalAlpha = (i / trailLen) * 0.8;
                    ctx.beginPath();
                    ctx.moveTo(this.trail[i].x, this.trail[i].y);
                    ctx.lineTo(this.trail[i + 1].x, this.trail[i + 1].y);
                    ctx.stroke();
                }
                ctx.globalAlpha = 1;
                ctx.fillStyle = this.color;
                ctx.beginPath();
                ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            } else {
                this.particles.forEach(function(p) {
                    p.draw();
                });
            }
        }

        isDead() {
            return this.exploded && this.particles.length === 0;
        }
    }

    /**
     * BigFirework - a special large shell that explodes into two distinct
     * groups of particles (two 'types') for a layered effect.
     */
    class BigFirework extends Firework {
        constructor() {
            super();
            // bias color to gold/red for big shell
            this.color = randomColor();
            this.big = true;
        }

        explode() {
            this.exploded = true;
            // stronger sound for big shell
            try {
                playFireworkSound((1.2 + Math.random() * 0.6) * 0.25);
            } catch (e) {}

            // First group: larger, slower particles (glow/bloom)
            const groupA = 40 + Math.floor(Math.random() * 40);
            for (let i = 0; i < groupA; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 1 + Math.random() * 3;
                const vx = Math.cos(angle) * speed;
                const vy = Math.sin(angle) * speed;
                const col = randomColor();
                this.particles.push(new Particle(
                    this.x,
                    this.y,
                    col, { x: vx, y: vy },
                    0.04, // gravity
                    0.995, // friction
                    0.006 + Math.random() * 0.006 // fade slower
                ));
                // make some of groupA slightly bigger
                this.particles[this.particles.length - 1].radius *= (1.4 + Math.random() * 1.2);
            }

            // Second group: many small fast sparkling particles
            const groupB = 80 + Math.floor(Math.random() * 80);
            for (let i = 0; i < groupB; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 3 + Math.random() * 6;
                const vx = Math.cos(angle) * speed;
                const vy = Math.sin(angle) * speed;
                // alternate palette for sparkling effect
                const col = fireworkColors[Math.floor(Math.random() * fireworkColors.length)];
                this.particles.push(new Particle(
                    this.x,
                    this.y,
                    col, { x: vx, y: vy },
                    0.06,
                    0.985,
                    0.01 + Math.random() * 0.02
                ));
                this.particles[this.particles.length - 1].radius *= (0.6 + Math.random() * 0.9);
            }
        }
    }

    // Mảng quản lý toàn bộ pháo hoa
    const fireworks = [];
    // Cycle timings (ms): spawn 1 at t=0, spawn 2 at t=5000, spawn 3 at t=15000
    const cycleOffsets = [0, 5000, 15000];
    const cycleLength = 16000; // repeat every 16s to avoid overlap
    let cycleStart = performance.now();
    let firedFlags = [false, false, false];
    // schedule for big shell every 15s
    let lastBigShell = performance.now() - 15000;

    function spawnFirework(now) {
        // normalize cycle start forward if very far behind
        if (now - cycleStart > cycleLength * 4) {
            cycleStart = now;
            firedFlags = [false, false, false];
        }

        let elapsed = now - cycleStart;
        // advance cycle if elapsed exceeds cycleLength
        if (elapsed >= cycleLength) {
            // start new cycle
            cycleStart += cycleLength * Math.floor(elapsed / cycleLength);
            elapsed = now - cycleStart;
            firedFlags = [false, false, false];
        }

        for (let i = 0; i < cycleOffsets.length; i++) {
            if (!firedFlags[i] && elapsed >= cycleOffsets[i]) {
                firedFlags[i] = true;
                if (i === 0) {
                    // single rocket
                    fireworks.push(new Firework());
                } else if (i === 1) {
                    // two rockets simultaneously
                    fireworks.push(new Firework());
                    fireworks.push(new Firework());
                } else if (i === 2) {
                    // three rockets simultaneously (bigger burst)
                    for (let k = 0; k < 3; k++) fireworks.push(new Firework());
                }
            }
        }

        // every 15s spawn one big shell (independent of cycle timings)
        if (now - lastBigShell >= 15000) {
            lastBigShell = now;
            fireworks.push(new BigFirework());
        }
    }

    function animateFireworks(now) {
        if (!canvas || !ctx || !canvas.width) return;
        ctx.fillStyle = "rgba(13, 13, 26, 0.15)";
        ctx.fillRect(0, 0, width, height);

        spawnFirework(now);

        for (let i = fireworks.length - 1; i >= 0; i--) {
            fireworks[i].update();
            fireworks[i].draw();
            if (fireworks[i].isDead()) {
                fireworks.splice(i, 1);
            }
        }

        requestAnimationFrame(animateFireworks);
    }
    if (canvas && ctx) {
        requestAnimationFrame(animateFireworks);
    }

    /* ========== TUYẾT RƠI ========== */
    const snowContainer = document.getElementById("snow-container");
    // Replace snow chars with floral emojis representing hoa mai / hoa đào
    const snowChars = ["🌼", "🌸", "🌺", "🌷"];
    const snowflakeCount = 50;

    function createSnowflake() {
        const flake = document.createElement("span");
        flake.className = "snowflake";
        // random choice and sometimes add color class
        flake.textContent = snowChars[Math.floor(Math.random() * snowChars.length)];
        // randomize size and duration for natural look
        flake.style.left = Math.random() * 100 + "%";
        const dur = 6 + Math.random() * 8;
        flake.style.animationDuration = dur + "s";
        flake.style.animationDelay = Math.random() * 5 + "s";
        flake.style.fontSize = (0.9 + Math.random() * 1.2) + "rem";
        flake.style.opacity = 0.8 - Math.random() * 0.35;
        // tint for yellow/rose flowers
        if (flake.textContent === "🌼") {
            flake.style.filter = "drop-shadow(0 2px 6px rgba(0,0,0,0.35)) saturate(1.2) hue-rotate(10deg)";
        } else if (flake.textContent === "🌸") {
            flake.style.filter = "drop-shadow(0 2px 6px rgba(0,0,0,0.35)) saturate(1.1) hue-rotate(-10deg)";
        }
        snowContainer.appendChild(flake);

        flake.addEventListener("animationiteration", function() {
            flake.style.left = Math.random() * 100 + "%";
        });
    }

    if (snowContainer) {
        for (let i = 0; i < snowflakeCount; i++) {
            createSnowflake();
        }
    }

    /* ========== FORM NHẬP TÊN - CHỈ HIỆN THIỆP SAU KHI NHẬP TÊN ========== */
    function initNameForm() {
        const nameFormWrapper = document.getElementById("name-form-wrapper");
        const nameForm = document.getElementById("name-form");
        const cardWrapper = document.getElementById("card-wrapper");
        const line0 = document.getElementById("line-0");
        const input = document.getElementById("user-name");
        const btnView = document.getElementById("btn-view-card");

        if (!nameForm || !cardWrapper || !line0) return;

        console.log("[initNameForm] form, input, cardWrapper initialized", { nameForm: !!nameForm, input: !!input, cardWrapper: !!cardWrapper });

        function submitName() {
            const name = input ? input.value.trim() : "";
            console.log("[submitName] called", { name });
            if (!name) {
                console.warn("[submitName] empty name - focusing input");
                if (input) {
                    input.focus();
                    input.placeholder = "Vui lòng nhập tên của bạn...";
                }
                return;
            }
            // special-case names: match regardless of case or diacritics
            function normalizeForMatch(s) {
                return s.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9\s]/g, '');
            }

            const normalized = normalizeForMatch(name);
            const tokens = normalized.split(/\s+/).filter(Boolean);

            let extra = '';
            // Tú Ngân -> match if user types 'ngan' or 'tu ngan' in any case
            if (tokens.includes('ngan')) {
                extra = 'Chúc Tú Ngân năm mới nhìu sức khỏe, gia đình hạnh phúc, học tập làm việc thuận lợi đạt kết quả tốt, thi bằng lái đậu full điểm, năm mới nhìu điều mới, chúc ngày càng xinh đẹp hơn';
            }
            // Kim Anh -> match if user types 'kim' or 'anh' or 'kim anh'
            else if (tokens.includes('kim') || tokens.includes('anh')) {
                extra = 'Chúc cô Kim Anh năm mới nhiều sức khỏe, công việc thuận lợi, mua thêm vài căn nữa.';
            }

            line0.textContent = "Chúc " + name + " năm mới vạn sự như ý.";
            // Show extra card if needed
            const extraWrapper = document.getElementById('extra-card-wrapper');
            const extraLineEl = document.getElementById('extra-line');
            if (extra && extraLineEl && extraWrapper) {
                extraLineEl.textContent = extra;
                extraWrapper.classList.remove('hidden');
                extraWrapper.style.display = 'flex';
                setTimeout(function() {
                    extraLineEl.classList.add('visible');
                }, 120);
            } else if (extraWrapper) {
                extraWrapper.classList.add('hidden');
                extraWrapper.style.display = 'none';
            }
            if (nameFormWrapper) nameFormWrapper.classList.add("hidden");
            cardWrapper.classList.remove("hidden");
            cardWrapper.style.display = "flex";
            cardWrapper.setAttribute("aria-hidden", "false");
            console.log("[submitName] card shown");
            showLines();
            // Try to start background music when user opens the card (user gesture)
            try {
                const bg = document.getElementById('bg-music');
                if (bg) {
                    bg.play().catch(function() {});
                    const mt = document.getElementById('music-toggle');
                    if (mt) mt.classList.remove('muted');
                }
            } catch (e) {}
            // resume WebAudio context (some browsers require a user gesture)
            try {
                const actx = getAudioCtx();
                if (actx && actx.state === 'suspended') {
                    actx.resume().catch(function() {});
                }
            } catch (e) {}
            // spawn one immediate firework for instant feedback
            try {
                if (typeof Firework !== 'undefined') {
                    fireworks.push(new Firework());
                }
            } catch (e) {}
        }

        nameForm.addEventListener("submit", function(e) {
            e.preventDefault();
            submitName();
        });

        if (btnView) {
            btnView.addEventListener("click", function() {
                submitName();
            });
        }

        // Ensure pressing Enter in the input also submits reliably
        if (input) {
            input.addEventListener("keydown", function(e) {
                if (e.key === "Enter") {
                    e.preventDefault();
                    submitName();
                }
            });
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initNameForm);
    } else {
        initNameForm();
    }

    /* ========== HIỆU ỨNG CHỮ - FADE-IN TỪNG DÒNG ========== */
    const lines = document.querySelectorAll(".wishes .line");
    const lineDelay = 400;

    function showLines() {
        lines.forEach(function(line, index) {
            setTimeout(function() {
                line.classList.add("visible");
            }, index * lineDelay);
        });
    }

    /* ========== NHẠC NỀN - NÚT BẬT/TẮT ========== */
    const audio = document.getElementById("bg-music");
    // lower default background music volume
    if (audio) audio.volume = 0.2;
    const musicToggle = document.getElementById("music-toggle");

    // Try autoplay: browsers often block autoplay with sound, so attempt and
    // fallback to playing on first user gesture if rejected.
    if (audio) {
        audio.loop = true;
        audio.preload = 'auto';
        audio.play().then(function() {
            if (musicToggle) musicToggle.classList.remove('muted');
        }).catch(function() {
            // wait for first user interaction
            const resume = function() {
                audio.play().catch(function() {});
                if (musicToggle) musicToggle.classList.remove('muted');
            };
            document.addEventListener('click', resume, { once: true });
            document.addEventListener('keydown', resume, { once: true });
        });
    }

    if (audio && musicToggle) {
        musicToggle.addEventListener("click", function() {
            if (audio.paused) {
                audio.play().catch(function() {});
                musicToggle.classList.remove("muted");
            } else {
                audio.pause();
                musicToggle.classList.add("muted");
            }
        });

        audio.addEventListener("ended", function() {
            musicToggle.classList.add("muted");
        });
        audio.addEventListener("pause", function() {
            musicToggle.classList.add("muted");
        });
        audio.addEventListener("play", function() {
            musicToggle.classList.remove("muted");
        });
    }
})();