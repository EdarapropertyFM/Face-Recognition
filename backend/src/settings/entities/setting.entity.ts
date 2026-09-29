import { Entity, Column, PrimaryColumn } from 'typeorm';

/**
 * System settings. One row, id 'system'.
 *
 * Every field here changes real behaviour. A setting that looks adjustable
 * but does nothing is worse than no setting at all: it tells an operator
 * they have control they do not have.
 */
@Entity('settings')
export class Setting {
  @PrimaryColumn()
  id: string; // always 'system'

  /**
   * How similar a face must be to a stored one before it is called a match,
   * as a percentage. Pushed to the AI service, where it becomes the cosine
   * similarity threshold on the embeddings.
   *
   * Lower recognises more people but starts naming the wrong ones; higher is
   * safer but leaves residents recorded as strangers.
   */
  @Column({ default: 40 })
  threshold: number;

  /** Days to keep sightings and their saved images before purging. */
  @Column({ default: 90 })
  retStd: number;

  /** Days to keep alerts and the audit trail. */
  @Column({ default: 365 })
  retLog: number;

  /** Raise an alert when a recognised resident is seen. */
  @Column({ default: false })
  alertOwners: boolean;

  /** Raise an alert when an unrecognised face is seen. */
  @Column({ default: true })
  alertStrangers: boolean;

  /** Run the retention purge automatically. Off means nothing is deleted. */
  @Column({ default: true })
  purgeEnabled: boolean;
}
