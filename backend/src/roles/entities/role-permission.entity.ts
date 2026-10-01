import { Entity, Column, PrimaryColumn } from 'typeorm';

/**
 * What each role may see and change, per module.
 *
 * These used to be a hard-coded constant in the browser bundle, which meant
 * nobody could change them without a deploy -- and that the rules were only
 * ever advisory, since the client decided them. Storing them makes the
 * matrix editable and gives the server a single answer to appeal to.
 */
@Entity('role_permissions')
export class RolePermission {
  @PrimaryColumn()
  role: string;

  /** Module keys this role may open. */
  @Column('jsonb', { default: [] })
  view: string[];

  /** Module keys this role may change. Editing implies viewing. */
  @Column('jsonb', { default: [] })
  edit: string[];

  /** Built-in roles cannot be deleted; Admin cannot be edited at all. */
  @Column({ default: false })
  builtIn: boolean;
}
