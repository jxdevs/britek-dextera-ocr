import { IsBoolean } from 'class-validator';

/** true = marcar la factura como causada; false = revertir la causación. */
export class SetAccrualDto {
  @IsBoolean()
  accrued!: boolean;
}
