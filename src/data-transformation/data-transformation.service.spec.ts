import { Test, TestingModule } from '@nestjs/testing';
import { DataTransformationService } from './data-transformation.service';

describe('DataTransformationService', () => {
  let service: DataTransformationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DataTransformationService],
    }).compile();

    service = module.get<DataTransformationService>(DataTransformationService);
  });

  describe('rawJsonNumberToStringConverter', () => {
    it('should convert numeric amount fields to string', () => {
      const input = '{"amount": 123.45, "other": 10}';
      const expectedOutput = '{"amount": "123.45", "other": 10}';
      expect(service.rawJsonNumberToStringConverter(input)).toBe(
        expectedOutput,
      );
    });

    it('should handle negative numbers and scientific notation', () => {
      const input = '{"amount": -1.23e+5}';
      const expectedOutput = '{"amount": "-1.23e+5"}';
      expect(service.rawJsonNumberToStringConverter(input)).toBe(
        expectedOutput,
      );
    });
    it('should handle 0', () => {
      const input = '{"amount": -0}';
      const expectedOutput = '{"amount": "-0"}';
      expect(service.rawJsonNumberToStringConverter(input)).toBe(
        expectedOutput,
      );
    });

    it('should also convert the fee field', () => {
      const input = '{"amount": 1.5, "fee": -0.0001, "other": 10}';
      const expectedOutput = '{"amount": "1.5", "fee": "-0.0001", "other": 10}';
      expect(service.rawJsonNumberToStringConverter(input)).toBe(
        expectedOutput,
      );
    });
  });

  describe('formatFromDecimalToIntegerString', () => {
    it('should convert decimal string to integer representation', () => {
      expect(service.formatFromDecimalToIntegerString('123.456')).toBe(
        12345600000,
      );
    });
    it('should convert big decimal number strings to integer representation', () => {
      expect(
        service.formatFromDecimalToIntegerString('21000000.12345678'),
      ).toBe(2100000012345678);
    });

    it('should handle scientific notation correctly', () => {
      expect(service.formatFromDecimalToIntegerString('1.23e+5')).toBe(
        12300000000000,
      );
    });

    it('should return 0 for invalid input', () => {
      expect(service.formatFromDecimalToIntegerString('invalid')).toBe(0);
    });

    it('should truncate fractional digits beyond satoshi precision instead of inflating the value', () => {
      expect(service.formatFromDecimalToIntegerString('1.234567891')).toBe(
        123456789,
      );
    });
  });

  describe('formatDecimalString', () => {
    it('should format an integer string correctly', () => {
      expect(service.formatDecimalString(12345678)).toBe('0.12345678');
    });

    it('should pad with leading zeros if needed', () => {
      expect(service.formatDecimalString(1234)).toBe('0.00001234');
    });
    it('should convert decimal string 0 if its null', () => {
      expect(service.formatDecimalString(null)).toBe('0.00000000');
    });
  });
});
