import type { Color, GameVariant, PieceKind } from '../game/types.ts'
import type { OpponentId } from '../opponents/opponents.ts'

/**
 * Russian counts take three forms: one шашка, две шашки, пять шашек. The
 * teens all take the last one, which is what the `% 100` test is for.
 */
function plural(n: number, one: string, few: string, many: string): string {
  const mod100 = Math.abs(n) % 100
  if (mod100 >= 11 && mod100 <= 14) return many
  const mod10 = mod100 % 10
  if (mod10 === 1) return one
  return mod10 >= 2 && mod10 <= 4 ? few : many
}

/** "a1", "a1 и b3", "a1, a2 и b3". */
const listOf = new Intl.ListFormat('ru', { type: 'conjunction' })

/** "на 21 клетку", "на 23 клетки", "на 25 клеток": a count after «на». */
function bySquares(squares: number): string {
  return `${squares} ${plural(squares, 'клетку', 'клетки', 'клеток')}`
}

export const ru = {
  brand: 'Damka',
  /** Author credit in the page footer. */
  credit: 'Программа разработана Антоном Медведевым',
  nav: {
    games: 'Игры',
    checkers: 'Шашки',
    giveaway: 'Поддавки',
    corners: 'Уголки',
  } satisfies Record<GameVariant | 'games', string>,
  piece: {
    white: { man: 'белая шашка', king: 'белая дамка' },
    black: { man: 'чёрная шашка', king: 'чёрная дамка' },
  } satisfies Record<Color, Record<PieceKind, string>>,
  emptySquare: 'пустое поле',
  /** Appended to a square label when it is a legal destination. */
  targetHint: 'ход возможен',
  /** Appended to the label of the selected piece's square. */
  selectedHint: 'выбрана',
  /** Уголки: the man is still in its own home as the deadline nears. */
  overdueHint: 'не вышла из дома',
  /** "c3, белая шашка" */
  squareLabel: (name: string, content: string) => `${name}, ${content}`,
  moveList: {
    title: 'Ходы',
    empty: 'Ходов пока нет',
  },
  controls: {
    undo: 'Отменить ход',
    redo: 'Вернуть ход',
    toLive: 'К текущей позиции',
    flip: 'Перевернуть доску',
    newGame: 'Новая игра',
  },
  sound: {
    /** Labels say what the button does, not what the state is. */
    enable: 'Включить звук',
    disable: 'Выключить звук',
  },
  newGame: {
    title: 'Новая игра',
    opponent: 'Соперник',
    /** Strength of a computer opponent, read out for the dots on its card. */
    strength: (level: number, of: number) => `Сила ${level} из ${of}`,
    yourColor: 'Ваш цвет',
    colors: { white: 'Белые', black: 'Чёрные', random: 'Случайно' },
    time: 'Время',
    /** Says what the two numbers of a time control actually mean. */
    timeHint:
      'Время даётся каждому на всю партию, добавка прибавляется после каждого хода.',
    ownTime: 'Свои',
    ownTimeNote: 'Задать самому',
    minutes: 'Минут на партию',
    increment: 'Секунд за ход',
    /** Two clocks instead of one: a handicap, and the usual reason for it. */
    splitTime: 'Сопернику другое время',
    /** Field labels once the clocks are split; who is who depends on the game. */
    yours: { minutes: 'Минут вам', increment: 'Секунд за ход вам' },
    theirs: {
      minutes: 'Минут сопернику',
      increment: 'Секунд за ход сопернику',
    },
    white: { minutes: 'Минут белым', increment: 'Секунд за ход белым' },
    black: { minutes: 'Минут чёрным', increment: 'Секунд за ход чёрным' },
    badTime: (maxMinutes: number, maxIncrement: number) =>
      `Минуты: от 1 до ${maxMinutes}. Добавка: от 0 до ${maxIncrement} секунд.`,
    start: 'Начать',
    cancel: 'Отмена',
  },
  /** Time controls, spelled out: no shorthand like "3 + 2" in the dialog. */
  timeControl: {
    none: { bank: 'Без часов', increment: 'Играем не спеша' },
    bank: (minutes: number) => `${minutes} мин на партию`,
    increment: (seconds: number) =>
      seconds === 0 ? 'Без добавки' : `+${seconds} сек за ход`,
  },
  clock: {
    yourTime: 'Ваше время',
    opponentTime: 'Время соперника',
    /** Hot-seat: neither clock belongs to "you". */
    side: { white: 'Время белых', black: 'Время чёрных' } satisfies Record<
      Color,
      string
    >,
    /** Announced once as the bank passes each threshold. */
    low: (seconds: number) => `Осталось ${seconds} секунд`,
    flag: 'Время вышло',
  },
  /** Badge shown while an earlier position is displayed. */
  review: 'просмотр',
  /** What the opponent says under its own face, in its own voice. */
  banter: {
    /**
     * It has nothing left but a draw and says so. `agree` is the button,
     * `accept` its accessible name: the question is not read out with it,
     * so the name has to say what is being agreed to.
     */
    draw: {
      ask: 'Похоже, ничья. Соглашаемся?',
      agree: 'Согласиться',
      accept: 'Согласиться на ничью',
    },
    /** It has a forced win and offers to spare you the rest. */
    resign: {
      ask: 'Вам уже не спастись. Сдаётесь?',
      agree: 'Сдаюсь',
      accept: 'Сдаться',
    },
    /** Turns the offer down; it is not made again this game. */
    decline: 'Играем дальше',
    /**
     * Уголки: the player still has men at home and this many moves to get
     * them out before the rule reads them as a loss (RULES.md, "Blocking").
     */
    deadline: (moves: number) =>
      moves === 1
        ? 'Выведите шашки из дома: это последний ход'
        : `Выведите шашки из дома: осталось ${moves} ${plural(moves, 'ход', 'хода', 'ходов')}`,
    /**
     * Short remarks on the move just played. The поддавки four answer the
     * checkers four: the same events, and the opposite thing to say about
     * them, because there a haul of pieces is a punishment and a дамка is
     * a piece nobody can get rid of. At уголки the only event is a long
     * chain of jumps, its own and the player's.
     */
    remark: {
      feast: 'Вкусно!',
      crowned: 'А вот и дамка!',
      ouch: 'Ох, больно…',
      praise: 'Хороший ход!',
      stuffed: 'Ох, накормили…',
      fed: 'Приятного аппетита!',
      burdened: 'Дамка? Вот незадача.',
      unloaded: 'Дамка вам не подарок!',
      leap: 'Вот это прыжок!',
      nimble: 'Ловко скачете!',
    },
  },
  turn: {
    white: 'Ход белых',
    black: 'Ход чёрных',
    you: 'вы',
    /** Appended to the opponent's name while its move is being searched. */
    thinking: 'думает…',
  } satisfies Record<Color | 'you' | 'thinking', string>,
  /** Status line once the game is over. */
  result: {
    white: 'Победа белых',
    black: 'Победа чёрных',
    draw: 'Ничья',
  } satisfies Record<Color | 'draw', string>,
  /** Same result, won on the clock rather than on the board. */
  resultOnTime: {
    white: 'Победа белых по времени',
    black: 'Победа чёрных по времени',
  } satisfies Record<Color, string>,
  /** Result screen, shown once the game is over. */
  gameOver: {
    /** Under the headline: whose result it is. */
    youWon: 'Вы выиграли',
    /** Verb first, so the persona's gender never has to agree with it. */
    winner: (name: string) => `Выигрывает ${name}`,
    /** Why the game ended; the headline already says how it stands. */
    reason: {
      time: 'Время вышло',
      noPieces: 'Шашек не осталось',
      noMoves: 'Ходить нечем',
      /** RULES.md counts the limit in plies; that is fifteen moves. */
      drawRule: 'Пятнадцать ходов дамками без взятий',
      agreed: 'Ничья по соглашению',
      resigned: 'Вы сдались',
      /** The уголки endings; RULES.md counts the limits in moves a side. */
      corners: {
        finish: 'Все шашки в доме соперника',
        finishBoth: 'Оба заняли дом соперника на одном ходу',
        /** The men the rule caught, by square; the general line if none. */
        blocked: (squares: ReadonlyArray<string>) =>
          squares.length === 0
            ? 'Шашки остались дома после сорокового хода'
            : squares.length === 1
              ? `Шашка ${squares[0]} осталась дома после сорокового хода`
              : `Шашки ${listOf.format(squares)} остались дома после сорокового хода`,
        blockedBoth: 'У обоих шашки остались дома после сорокового хода',
        limit: 'Больше шашек в доме соперника после восьмидесятого хода',
        limitEven: 'Поровну шашек в доме соперника после восьмидесятого хода',
      },
    },
    stats: {
      title: 'Партия в числах',
      moves: 'Ходов',
      taken: 'Взято шашек',
      crowned: 'Прошло в дамки',
      time: 'Время на ходы',
      longest: 'Самый долгий ход',
      biggest: 'Крупнейшее взятие',
      /** Уголки rows: moves that jumped, and the most jumps in one move. */
      leaps: 'Ходов с прыжками',
      longestLeap: 'Самая длинная цепочка',
      /** Column heads: the player's own side comes first. */
      you: 'Вы',
      white: 'Белые',
      black: 'Чёрные',
      /** Pieces taken in one move, in the "крупнейшее взятие" row. */
      inOneMove: (count: number) =>
        `${count} ${plural(count, 'шашка', 'шашки', 'шашек')}`,
      /** Jumps in one move, in the "самая длинная цепочка" row. */
      jumpsInOneMove: (count: number) =>
        `${count} ${plural(count, 'прыжок', 'прыжка', 'прыжков')}`,
      none: '—',
    },
    chart: {
      title: 'Перевес в материале',
      white: 'Белые',
      black: 'Чёрные',
      description:
        'Перевес в материале по ходам партии: у белых он отложен вверх от оси, у чёрных вниз. Дамка считается за три шашки.',
      /**
       * The same graph read for поддавки, where the side with fewer pieces
       * is the one in front. The series is turned over so that up still
       * means winning; the wording has to say why.
       */
      giveaway: {
        title: 'Перевес в партии',
        description:
          'Перевес по ходам партии: в поддавках впереди тот, у кого шашек меньше. У белых перевес отложен вверх от оси, у чёрных вниз. Дамка считается за три шашки.',
        lead: (advantage: number) => ru.gameOver.chart.lead(advantage),
      },
      /**
       * The same graph at уголки, where nothing is ever taken: the lead
       * is in squares, how much less a side still has to walk than the
       * other. The table under it lists the walk left after every ply.
       */
      corners: {
        title: 'Перевес в гонке',
        description:
          'Перевес по ходам партии: на сколько клеток меньше осталось пройти до дома соперника. У белых перевес отложен вверх от оси, у чёрных вниз.',
        lead: (advantage: number) =>
          advantage === 0
            ? 'Идут вровень'
            : advantage > 0
              ? `Белые впереди на ${bySquares(advantage)}`
              : `Чёрные впереди на ${bySquares(-advantage)}`,
        tableCaption: 'Осталось пройти после каждого полухода',
        /** A table cell on its own: "21 клетка", "23 клетки", "25 клеток". */
        left: (squares: number) =>
          `${squares} ${plural(squares, 'клетка', 'клетки', 'клеток')}`,
      },
      /** Reading under the graph; the number leads, the move follows. */
      lead: (advantage: number) =>
        advantage === 0
          ? 'Материал равный'
          : advantage > 0
            ? `+${advantage} у белых`
            : `+${-advantage} у чёрных`,
      afterMove: (move: number) =>
        move === 0 ? 'начало партии' : `после ${move}-го хода`,
      /** Unit of the horizontal axis, at its right end. */
      axis: 'ход',
      tableCaption: 'Материал после каждого полухода',
      ply: 'Полуход',
      /** "9 шашек, 2 дамки" */
      pieces: (men: number, kings: number) => {
        const shashki = `${men} ${plural(men, 'шашка', 'шашки', 'шашек')}`
        if (kings === 0) return shashki
        return `${shashki}, ${kings} ${plural(kings, 'дамка', 'дамки', 'дамок')}`
      },
    },
    /** Reopens the result screen from the status line. */
    show: 'Итог партии',
    close: 'Закрыть',
    newGame: 'Новая игра',
  },
  opponents: {
    kitten: { name: 'Котёнок', tagline: 'Ходит куда глаза глядят' },
    hare: { name: 'Заяц', tagline: 'Ходит быстро, думает потом' },
    fox: { name: 'Лиса', tagline: 'Хитрит и ставит ловушки' },
    owl: { name: 'Сова', tagline: 'Не спешит и всё замечает' },
    raven: { name: 'Ворон', tagline: 'Помнит все ваши ошибки' },
    friend: { name: 'Друг рядом', tagline: 'Двое за одним устройством' },
  } satisfies Record<OpponentId, { name: string; tagline: string }>,
}

export type Strings = typeof ru
