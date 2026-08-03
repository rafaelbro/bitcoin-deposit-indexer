import { Test, TestingModule } from '@nestjs/testing';
import { MessagingService } from './messaging.service';
import {
  ClientProxyFactory,
  ClientProxy,
  Transport,
} from '@nestjs/microservices';
import { MessageType } from 'src/enum/messageType';
import { ConfigModule, ConfigService } from '@nestjs/config';

jest.mock('@nestjs/microservices', () => {
  const actual = jest.requireActual('@nestjs/microservices');
  return {
    ...actual,
    ClientProxyFactory: {
      create: jest.fn(),
    },
    Transport: { RMQ: 'rmq' },
  };
});

describe('MessagingService', () => {
  let service: MessagingService;
  let clientProxyMock: jest.Mocked<ClientProxy>;
  let configServiceMock: Partial<Record<string, jest.Mock>>;

  beforeEach(async () => {
    clientProxyMock = {
      send: jest.fn().mockReturnValue({ toPromise: jest.fn() }),
      connect: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ClientProxy>;

    (ClientProxyFactory.create as jest.Mock).mockReturnValue(clientProxyMock);

    configServiceMock = {
      get: jest.fn().mockImplementation((key: string) => {
        const mockConfig = {
          RABBITMQ_URL: 'amqp://testuser:testpassword@localhost:5672',
          RABBITMQ_QUEUE: 'bitcoin_processing',
        };
        return mockConfig[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot()],
      providers: [
        MessagingService,
        {
          provide: ConfigService,
          useValue: configServiceMock, 
        },
      ],
    }).compile();

    service = module.get<MessagingService>(MessagingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should connect to RabbitMQ on module init', async () => {
    await service.onModuleInit();
    expect(clientProxyMock.connect).toHaveBeenCalled();
  });

  it('should send a message to RabbitMQ for bitcoin processing', async () => {
    const data = { amount: 100, currency: 'BTC' };
    await service.sendMessageBitcoin(data);

    expect(clientProxyMock.send).toHaveBeenCalledWith('bitcoin_processing', {
      type: MessageType.PAYLOAD_PROCESS,
      payload: data,
    });
  });

  it('should send a summary message to RabbitMQ', async () => {
    await service.processOutput();

    expect(clientProxyMock.send).toHaveBeenCalledWith('bitcoin_processing', {
      type: MessageType.SUMMARY,
      payload: [],
    });
  });

  it('should send a message with a custom pattern', async () => {
    const pattern = 'custom_pattern';
    const message = { customData: 'test' };

    await service.sendMessage(pattern, message);

    expect(clientProxyMock.send).toHaveBeenCalledWith(pattern, message);
  });

  it('should disconnect from RabbitMQ on module destroy', async () => {
    await service.onModuleDestroy();
    expect(clientProxyMock.close).toHaveBeenCalled();
  });
});
