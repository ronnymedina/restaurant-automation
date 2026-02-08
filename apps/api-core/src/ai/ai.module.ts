import { Module } from '@nestjs/common';
import { GeminiService } from './gemini.service';
import { ConfigModule } from '@nestjs/config';
import { aiConfig } from './ai.config';

@Module({
  imports: [ConfigModule.forFeature(aiConfig)],
  providers: [GeminiService],
  exports: [GeminiService],
})
export class AiModule { }
