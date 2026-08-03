import { Controller, Logger } from '@nestjs/common';
import { Ctx, MessagePattern, Payload, RmqContext } from '@nestjs/microservices';
import { BitcoinManagerService } from './bitcoin-manager.service';
import { MessageType } from 'src/enum/messageType';

interface BitcoinMessage {
  type: MessageType;
  payload?: unknown;
}

@Controller()
export class BitcoinManagerController {
  private readonly logger = new Logger(BitcoinManagerController.name);

  constructor(private readonly bitcoinManagerService: BitcoinManagerService) {}

  @MessagePattern('bitcoin_processing')
  async handleMessage(
    @Payload() rawData: unknown,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      if (!this.isValidBitcoinMessage(rawData)) {
        this.logger.error('Invalid message format, discarding message');
        channel.ack(originalMsg);
        return;
      }

      const data: BitcoinMessage = rawData;

      switch (data.type) {
        case MessageType.PAYLOAD_PROCESS:
          this.logger.log(`received Bitcoin transaction`);
          if (typeof data.payload !== 'string') {
            this.logger.error('Invalid payload format, expected string');
            channel.ack(originalMsg);
            return;
          }
          await this.bitcoinManagerService.processRawJSONforDeposit(
            data.payload,
          );
          this.logger.log('Processed deposits successfully');
          break;
        case MessageType.SUMMARY:
          this.logger.log(`Printing database summary`);
          await this.bitcoinManagerService.processUserSummary();
          break;
        default:
          this.logger.error('Unknown message type, discarding message');
          channel.ack(originalMsg);
          return;
      }

      channel.ack(originalMsg);
    } catch (error) {
      this.logger.error('Error processing message, requeueing:', error);
      channel.nack(originalMsg, false, true);
    }
  }

  private isValidBitcoinMessage(data: unknown): data is BitcoinMessage {
    return (
      typeof data === 'object' &&
      data !== null &&
      'type' in data &&
      Object.values(MessageType).includes((data as BitcoinMessage).type)
    );
  }
}
