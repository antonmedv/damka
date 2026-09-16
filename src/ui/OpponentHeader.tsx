import type { Color, GameStatus } from '../game/types.ts'
import { t } from '../i18n/index.ts'
import { Avatar } from '../opponents/avatars/Avatar.tsx'
import type { Opponent } from '../opponents/opponents.ts'
import type { OfferKind } from '../state/gameReducer.ts'
import type { Banter } from './banter.ts'
import './OpponentHeader.css'

type OpponentHeaderProps = {
  opponent: Opponent
  humanColor: Color | 'both'
  toMove: Color
  status?: GameStatus
  /** The game was won on the clock rather than on the board. */
  onTime?: boolean
  /** The computer opponent is searching its move. */
  thinking?: boolean
  /** What the opponent is saying; nothing while it has nothing to say. */
  banter?: Banter | null
  /** When given, the result bubble reopens the result screen. */
  onShowResult?: () => void
  /** Takes the persona up on the offer it is making. */
  onAccept?: (offer: OfferKind) => void
  /** Turns it down; the game goes on. */
  onDecline?: (offer: OfferKind) => void
  onNewGame?: () => void
}

/**
 * The opponent's face, its name, and a speech bubble under both. Whose
 * turn it is is left to the board, where the player is already looking;
 * the bubble is kept for the things that ask something of them — the
 * result, a draw the persona no longer hopes to get past, a win it has
 * already seen to the end.
 *
 * What the board says in colour and the bubble in pictures is said in
 * words in one live region, which carries the turn as well as the line in
 * the bubble. The bubble itself is hidden from a reader so nothing is
 * announced twice; its buttons stay, since a control inside a live region
 * is read out at the reader rather than handed to them.
 */
export function OpponentHeader({
  opponent,
  humanColor,
  toMove,
  status = 'ongoing',
  onTime = false,
  thinking = false,
  banter = null,
  onShowResult,
  onAccept,
  onDecline,
  onNewGame,
}: OpponentHeaderProps) {
  const { name, tagline } = t.opponents[opponent.id]
  const result = status === 'ongoing' ? null : resultLine(status, onTime)
  // The search shows as a pulsing ring around the avatar, so nothing on the
  // row moves from move to move; the words stay for screen readers.
  const searching = thinking && humanColor !== 'both'
  const spoken = [
    result ?? turnLine(toMove, humanColor, name),
    searching ? `${name} ${t.turn.thinking}` : null,
    banter?.kind === 'offer' ? t.banter[banter.offer].ask : null,
    banter?.kind === 'remark' ? t.banter.remark[banter.id] : null,
  ]
    .filter((part) => part !== null)
    .join('. ')

  return (
    <header className="opponent">
      <span
        className={`opponent__avatar${searching ? ' opponent__avatar--thinking' : ''}`}
      >
        <Avatar id={opponent.id} label={name} />
      </span>
      <div className="opponent__text">
        <h2 className="opponent__name">{name}</h2>
        <p className="opponent__tagline">{tagline}</p>
      </div>
      {onNewGame && (
        <div className="opponent__actions">
          <button
            type="button"
            className="button opponent__new-game"
            onClick={onNewGame}
          >
            {t.controls.newGame}
          </button>
        </div>
      )}
      <p className="opponent__spoken" role="status">
        {spoken}
      </p>
      <div className="opponent__say">
        {result !== null && banter?.kind === 'result' && (
          <Result line={result} onShow={onShowResult} />
        )}
        {banter?.kind === 'offer' && (
          <Offer
            offer={banter.offer}
            onAccept={onAccept}
            onDecline={onDecline}
          />
        )}
        {banter?.kind === 'remark' && (
          <span className="opponent__bubble" aria-hidden="true">
            {t.banter.remark[banter.id]}
          </span>
        )}
      </div>
    </header>
  )
}

/** How it stands: a draw, or who won and whether it was on the clock. */
function resultLine(status: GameStatus, onTime: boolean): string {
  const winner: Color | null =
    status === 'whiteWins' ? 'white' : status === 'blackWins' ? 'black' : null
  if (winner === null) return t.result.draw
  return onTime ? t.resultOnTime[winner] : t.result[winner]
}

/** Whose move it is, and whose side that is; nobody's for two humans. */
function turnLine(
  toMove: Color,
  humanColor: Color | 'both',
  name: string,
): string {
  const head = t.turn[toMove]
  if (humanColor === 'both') return head
  return `${head} · ${toMove === humanColor ? t.turn.you : name}`
}

/** How it ended, and a way back to the screen that says how it got there. */
function Result({ line, onShow }: { line: string; onShow?: () => void }) {
  if (onShow === undefined) {
    return (
      <span className="opponent__bubble" aria-hidden="true">
        {line}
      </span>
    )
  }
  return (
    <button
      type="button"
      className="opponent__bubble opponent__bubble--result"
      onClick={onShow}
      // The result itself is announced by the live region above, so the
      // button is named for what pressing it does.
      aria-label={t.gameOver.show}
      title={t.gameOver.show}
    >
      <span aria-hidden="true">{line}</span>
    </button>
  )
}

type OfferProps = {
  offer: OfferKind
  onAccept?: (offer: OfferKind) => void
  onDecline?: (offer: OfferKind) => void
}

/**
 * The persona asking to end the game where it stands. Taking it up saves
 * the player from playing out an ending both sides can already see; the
 * way out of it is the second button, not a move on the board.
 */
function Offer({ offer, onAccept, onDecline }: OfferProps) {
  return (
    <div className="opponent__bubble opponent__bubble--offer">
      <span className="opponent__ask" aria-hidden="true">
        {t.banter[offer].ask}
      </span>
      <span className="opponent__reply">
        <button
          type="button"
          className="button opponent__agree"
          // "Согласиться" says nothing away from the question above it.
          aria-label={t.banter[offer].accept}
          onClick={() => onAccept?.(offer)}
        >
          {t.banter[offer].agree}
        </button>
        <button
          type="button"
          className="button opponent__decline"
          onClick={() => onDecline?.(offer)}
        >
          {t.banter.decline}
        </button>
      </span>
    </div>
  )
}
