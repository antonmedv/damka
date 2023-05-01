import {Network} from './network'

export type Competitor = {
  net: Network
  score: number
  won: number
  lose: number
  draw: number
  sigma: number[]
}

export type Generation = {
  number: number
  population: Competitor[]
}
