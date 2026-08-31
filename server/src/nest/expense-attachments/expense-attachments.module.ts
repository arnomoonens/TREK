import { Module } from '@nestjs/common';
import { AddonsModule } from '../addons/addons.module';
import { AppConfigModule } from '../app-config/app-config.module';
import { FilesModule } from '../files/files.module';
import { PluginGuardsModule } from '../plugins/host/plugin-guards.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { ExpenseAttachmentsController } from './expense-attachments.controller';
import { ExpenseAttachmentsMcp } from './expense-attachments.mcp';
import { ExpenseAttachmentsRpc } from './expense-attachments.rpc';
import { ExpenseAttachmentsService } from './expense-attachments.service';

@Module({
  imports: [FilesModule, PermissionsModule, AppConfigModule, AddonsModule, PluginGuardsModule],
  controllers: [ExpenseAttachmentsController],
  providers: [ExpenseAttachmentsService, ExpenseAttachmentsMcp, ExpenseAttachmentsRpc],
  exports: [ExpenseAttachmentsService],
})
export class ExpenseAttachmentsModule {}
