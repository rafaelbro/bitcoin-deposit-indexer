import { Module } from '@nestjs/common';
import { DataTransformationService } from './data-transformation.service';

@Module({
  providers: [DataTransformationService],
  exports: [DataTransformationService],
})
export class DataTransformationModule {}
