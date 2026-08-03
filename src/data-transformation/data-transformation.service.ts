import { Injectable } from '@nestjs/common';

@Injectable()
export class DataTransformationService {
  private readonly MONETARY_JSON_FIELDS = ['amount', 'fee'];
  private readonly REPLACE_FROM_NUMBER_REGEX = new RegExp(
    `"(${this.MONETARY_JSON_FIELDS.join('|')})":\\s*(-?\\d+(?:\\.\\d+)?(?:[eE][-+]?\\d+)?)`,
    'g',
  );
  private readonly SCIENTIFIC_NOTATION_REGEX = /^[+-]?\d+(\.\d+)?[eE][+-]?\d+$/;
  private readonly VALID_NUMBER_REGEX = /^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$/;
  private readonly SATOSHI_DECIMALS = 8;

  rawJsonNumberToStringConverter(rawjson: string) {
    return rawjson.replace(this.REPLACE_FROM_NUMBER_REGEX, '"$1": "$2"');
  }

  formatFromDecimalToIntegerString(amount: string): number {
    if (!this.VALID_NUMBER_REGEX.test(amount)) {
      console.error('INVALID FORMAT IN JSON: ', amount);
      return 0;
    }
    if (this.SCIENTIFIC_NOTATION_REGEX.test(amount)) {
      amount = Number(amount).toFixed(this.SATOSHI_DECIMALS);
    }
    const [integerPart, initialDecimalPart = ''] = amount.split('.');
    const decimalPart = initialDecimalPart
      .padEnd(this.SATOSHI_DECIMALS, '0')
      .slice(0, this.SATOSHI_DECIMALS);
    return parseInt(integerPart + decimalPart);
  }

  formatDecimalString(inputNumber: number | null): string {
    if (inputNumber === null) {
      return '0.00000000';
    }
    let numberString = inputNumber.toString();

    numberString = numberString.padStart(9, '0');

    const formattedNumber =
      numberString.slice(0, -8) + '.' + numberString.slice(-8);

    return formattedNumber;
  }
}
