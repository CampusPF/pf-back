#!/usr/bin/env node
/**
 * Mata cualquier proceso que esté escuchando en PORT (o 4000 por default)
 * antes de levantar el server. En Windows, `nest start --watch` deja
 * seguido procesos hijos huérfanos (Ctrl+C no siempre les llega la señal),
 * que se quedan colgados del puerto y el siguiente `npm run start:dev`
 * explota con EADDRINUSE. Se corre como pre-paso de start/start:dev.
 *
 * Silencioso si no hay nada escuchando: no es un error, es el caso normal.
 */
const { execSync } = require('child_process');

const port = process.env.PORT || 4000;

function killWindows(port) {
  let out;
  try {
    out = execSync(`netstat -ano -p tcp`, { encoding: 'utf8' });
  } catch {
    return;
  }

  const pids = new Set();
  for (const line of out.split('\n')) {
    const match = line.match(/^\s*TCP\s+\S*:(\d+)\s+\S+\s+LISTENING\s+(\d+)/);
    if (match && Number(match[1]) === Number(port)) {
      pids.add(match[2]);
    }
  }

  for (const pid of pids) {
    // No matarse a uno mismo por las dudas.
    if (Number(pid) === process.pid) continue;
    try {
      execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
      console.log(`🔪 Puerto ${port} liberado (mató PID ${pid})`);
    } catch {
      // Ya murió entre el netstat y el taskkill, no pasa nada.
    }
  }
}

function killUnix(port) {
  let pids;
  try {
    pids = execSync(`lsof -ti tcp:${port}`, { encoding: 'utf8' }).trim();
  } catch {
    return;
  }
  if (!pids) return;

  for (const pid of pids.split('\n')) {
    if (!pid || Number(pid) === process.pid) continue;
    try {
      execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
      console.log(`🔪 Puerto ${port} liberado (mató PID ${pid})`);
    } catch {
      // Ya murió, ok.
    }
  }
}

if (process.platform === 'win32') {
  killWindows(port);
} else {
  killUnix(port);
}
