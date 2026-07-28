import { IsUUID } from 'class-validator';

export class AssignDocumentDto {
  @IsUUID('4')
  box_id!: string;
}
