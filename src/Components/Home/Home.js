import React, { useRef, useEffect } from 'react';
import './Home.css';

function Home() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    let width = window.innerWidth;
    let height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    window.addEventListener('resize', () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    });

    // ------ Bouncing Balls Setup ------
    class Ball {
      constructor(x, y, vx, vy, radius, color) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.radius = radius;
        this.color = color;
      }

      draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2, false);
        ctx.fillStyle = this.color;
        ctx.fill();
      }

      update() {
        this.x += this.vx;
        this.y += this.vy;

        // Bounce off left/right
        if (this.x + this.radius > width || this.x - this.radius < 0) {
          this.vx = -this.vx;
        }
        // Bounce off top/bottom
        if (this.y + this.radius > height || this.y - this.radius < 0) {
          this.vy = -this.vy;
        }
      }
    }

    // ------ Firework Particles Setup ------
    class Particle {
      constructor(x, y, vx, vy, color) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.alpha = 1;
        this.color = color;
      }

      draw() {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 3, 0, Math.PI * 2, false);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.restore();
      }

      update() {
        this.x += this.vx;
        this.y += this.vy;
        this.alpha -= 0.02;
      }
    }

    let balls = [];
    let particles = [];

    // Create initial balls
    for (let i = 0; i < 20; i++) {
      const radius = 20 + Math.random() * 10;
      const x = Math.random() * (width - radius * 2) + radius;
      const y = Math.random() * (height - radius * 2) + radius;
      const vx = (Math.random() - 0.5) * 4;
      const vy = (Math.random() - 0.5) * 4;
      const color = `hsl(${Math.random() * 360}, 70%, 60%)`;
      balls.push(new Ball(x, y, vx, vy, radius, color));
    }

    const createParticles = (x, y) => {
      const count = 20;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 5;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        const color = `hsl(${Math.random() * 360}, 70%, 60%)`;
        particles.push(new Particle(x, y, vx, vy, color));
      }
    };

    let isMouseDown = false;
    let mouseX, mouseY;

    const handleMouseDown = (e) => {
      isMouseDown = true;
      mouseX = e.clientX;
      mouseY = e.clientY;
      createParticles(mouseX, mouseY);
    };

    const handleMouseUp = () => {
      isMouseDown = false;
    };

    const handleMouseMove = (e) => {
      if (isMouseDown) {
        mouseX = e.clientX;
        mouseY = e.clientY;
        createParticles(mouseX, mouseY);
      }
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mousemove', handleMouseMove);

    function animate() {
      requestAnimationFrame(animate);
      ctx.clearRect(0, 0, width, height);

      // Update and draw balls
      balls.forEach(ball => {
        ball.update();
        ball.draw();
      });

      // Update and draw particles
      particles = particles.filter(p => p.alpha > 0);
      particles.forEach(p => {
        p.update();
        p.draw();
      });
    }

    animate();

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return (
    <div className="home-container">
      <canvas ref={canvasRef} />
    </div>
  );
}

export default Home;
