import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsUUID,
} from 'class-validator';

export class AssignWorkersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  worker_ids!: string[];

  @IsOptional()
  @IsUUID('4')
  primary_worker_id?: string;
}
