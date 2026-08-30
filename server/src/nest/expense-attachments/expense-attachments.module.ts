import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { ExpenseAttachmentsController } from './expense-attachments.controller';
import { ExpenseAttachmentsService } from './expense-attachments.service';

@Module({
  imports: [FilesModule, PermissionsModule],
  controllers: [ExpenseAttachmentsController],
  providers: [ExpenseAttachmentsService],
  exports: [ExpenseAttachmentsService],
})
export class ExpenseAttachmentsModule {}
