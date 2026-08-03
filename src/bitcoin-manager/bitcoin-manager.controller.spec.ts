import { Test, TestingModule } from '@nestjs/testing';
import { RmqContext } from '@nestjs/microservices';
import { BitcoinManagerController } from './bitcoin-manager.controller';
import { BitcoinManagerService } from './bitcoin-manager.service';
import { MessageType } from 'src/enum/messageType';

function createMockRmqContext() {
  const channel = { ack: jest.fn(), nack: jest.fn() };
  const message = { content: Buffer.from('') };
  const context = {
    getChannelRef: () => channel,
    getMessage: () => message,
  } as unknown as RmqContext;
  return { context, channel, message };
}

describe('BitcoinManagerController', () => {
  let controller: BitcoinManagerController;
  let bitcoinManagerService: BitcoinManagerService;

  beforeEach(async () => {
    const mockBitcoinManagerService = {
      processRawJSONforDeposit: jest.fn().mockResolvedValue(undefined),
      processUserSummary: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BitcoinManagerController],
      providers: [
        {
          provide: BitcoinManagerService,
          useValue: mockBitcoinManagerService,
        },
      ],
    }).compile();

    controller = module.get<BitcoinManagerController>(BitcoinManagerController);
    bitcoinManagerService = module.get<BitcoinManagerService>(
      BitcoinManagerService,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('handleMessage', () => {
    it('should call processRawJSONforDeposit and ack for PAYLOAD_PROCESS message type', async () => {
      const payload = {
        type: MessageType.PAYLOAD_PROCESS,
        payload: JSON.stringify({ transaction: 'testTransaction' }),
      };
      const { context, channel, message } = createMockRmqContext();

      await controller.handleMessage(payload, context);

      expect(
        bitcoinManagerService.processRawJSONforDeposit,
      ).toHaveBeenCalledWith(payload.payload);
      expect(channel.ack).toHaveBeenCalledWith(message);
      expect(channel.nack).not.toHaveBeenCalled();
    });

    it('should call processUserSummary and ack for SUMMARY message type', async () => {
      const payload = {
        type: MessageType.SUMMARY,
      };
      const { context, channel, message } = createMockRmqContext();

      await controller.handleMessage(payload, context);

      expect(bitcoinManagerService.processUserSummary).toHaveBeenCalled();
      expect(channel.ack).toHaveBeenCalledWith(message);
      expect(channel.nack).not.toHaveBeenCalled();
    });

    it('should not call any service method and ack (discard) for unknown message types', async () => {
      const payload = {
        type: 'UNKNOWN_TYPE',
      };
      const { context, channel } = createMockRmqContext();

      await controller.handleMessage(payload, context);

      expect(
        bitcoinManagerService.processRawJSONforDeposit,
      ).not.toHaveBeenCalled();
      expect(bitcoinManagerService.processUserSummary).not.toHaveBeenCalled();
      expect(channel.ack).toHaveBeenCalled();
      expect(channel.nack).not.toHaveBeenCalled();
    });

    it('should ack (discard) an invalid payload format instead of requeueing a message that can never succeed', async () => {
      const payload = {
        type: MessageType.PAYLOAD_PROCESS,
        payload: { transaction: 'testTransaction' },
      };
      const { context, channel } = createMockRmqContext();

      await controller.handleMessage(payload, context);

      expect(
        bitcoinManagerService.processRawJSONforDeposit,
      ).not.toHaveBeenCalled();
      expect(channel.ack).toHaveBeenCalled();
      expect(channel.nack).not.toHaveBeenCalled();
    });

    it('should nack with requeue when processRawJSONforDeposit fails', async () => {
      const payload = {
        type: MessageType.PAYLOAD_PROCESS,
        payload: JSON.stringify({ transaction: 'testTransaction' }),
      };
      const { context, channel, message } = createMockRmqContext();

      const error = new Error('Test error');
      jest
        .spyOn(bitcoinManagerService, 'processRawJSONforDeposit')
        .mockRejectedValue(error);

      await expect(
        controller.handleMessage(payload, context),
      ).resolves.not.toThrow();

      expect(channel.nack).toHaveBeenCalledWith(message, false, true);
      expect(channel.ack).not.toHaveBeenCalled();
    });
  });
});
