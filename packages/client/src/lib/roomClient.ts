import type { AckResult, Participant, RoomConfig, RoomState } from '@fal/shared';
import { socket } from '../socket.js';

type EnterResult = { roomState: RoomState; you: Participant };

function unwrap<T>(resolve: (v: T) => void, reject: (e: Error) => void) {
  return (res: AckResult<T>) => {
    if (res.ok) resolve(res.data);
    else reject(new Error(res.error));
  };
}

export function createRoom(nickname: string, config?: Partial<RoomConfig>): Promise<EnterResult> {
  return new Promise((resolve, reject) => {
    socket.emit('room:create', { nickname, config }, unwrap(resolve, reject));
  });
}

export function joinRoom(code: string, nickname: string): Promise<EnterResult> {
  return new Promise((resolve, reject) => {
    socket.emit('room:join', { code, nickname }, unwrap(resolve, reject));
  });
}

export function rejoinRoom(roomId: string, playerId: string): Promise<EnterResult> {
  return new Promise((resolve, reject) => {
    socket.emit('room:rejoin', { roomId, playerId }, unwrap(resolve, reject));
  });
}

export function startGame(): Promise<{ roomState: RoomState }> {
  return new Promise((resolve, reject) => {
    socket.emit('room:start', unwrap(resolve, reject));
  });
}

export function setReady(ready: boolean): void {
  socket.emit('room:setReady', { ready });
}

export function leaveRoom(): void {
  socket.emit('room:leave');
}
