import { MonitoredMessage } from './../puppeteer/types/puppeteer.types';
import { Injectable, Logger } from '@nestjs/common';
import { SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { createServer } from 'http';
import { Server } from 'socket.io';

@Injectable()
@WebSocketGateway()
export class MessagesGateway {
  private io: Server;
  private logger = new Logger('MessagesGateway');
  private httpServer = createServer();

  constructor() { 
    const port = process.env.PORT ?? 4000;

    this.io = new Server(this.httpServer, {
      cors: {
        origin: '*',
      },
    });
    this.httpServer.listen(port, () => {
      this.logger.log(`WS server is listening on port ${port}`);
    });
    this.io.on('connection', (socket) => {
      this.logger.log(`client connected: ${socket.id}`);
      socket.on('disconnect', () => {
        this.logger.log(`client disconnected: ${socket.id}`);
      }); 
    });
  }

  sendMessage(msg: MonitoredMessage) {
    this.io.emit('new_message', msg);
  }

  sendError(code: number, message: string) {
    this.io.emit('error', { code, message });
  }
}
