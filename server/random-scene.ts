/**
 * Seeds for "surprise me": a kind of conversation, a place and a person, drawn at random and
 * handed to the model as the request. They are prompt text only and are never shown; the scene
 * the learner sees is written by the model in the interface language.
 */
export const RANDOM_SCENES = {
  daily: {
    places: [
      'a bakery just before closing', 'a laundromat', 'a bus stop in the rain', 'a pharmacy counter', 'the stairwell of an apartment building',
      'a weekend flea market', 'a barbershop', 'a small pet shop', 'a parcel pickup point', 'a neighbourhood noodle shop',
    ],
    people: ['a talkative shop owner', 'a new neighbour', 'a student working part-time', 'a retiree who knows everyone', 'a delivery rider on a break', 'a parent with a small child'],
  },
  travel: {
    places: [
      'a night train compartment', 'a hostel kitchen', 'a ferry deck', 'a small-town tourist office', 'a mountain hut',
      'an airport gate during a delay', 'a street food market', 'a bike rental shop', 'a museum cloakroom', 'a guesthouse front desk',
    ],
    people: ['a local guide', 'a fellow traveller', 'a guesthouse host', 'a taxi driver', 'a tourist who is lost', 'a ticket inspector'],
  },
  work: {
    places: [
      'the office kitchen', 'a shared co-working desk', 'the reception area of a client', 'a lift that is slow to arrive', 'a trade fair stand',
      'a video call that started early', 'a warehouse loading dock', 'the first day at a new job', 'a team lunch', 'a late evening at the office',
    ],
    people: ['a new colleague', 'a long-standing client', 'a mentor close to retirement', 'an intern', 'a supplier', 'a manager from another team'],
  },
  social: {
    places: [
      'a housewarming party', 'a board game cafe', 'a wedding table of strangers', 'a climbing gym', 'a language exchange meetup',
      'a concert queue', 'a community garden', 'a cooking class', 'a book club', 'a dog park',
    ],
    people: ['a friend of a friend', 'an old classmate', 'the host', 'a regular who knows everyone', 'someone who came alone', 'a neighbour'],
  },
  study: {
    places: [
      'a library group study room', 'a university canteen', 'a lab before an experiment', 'an evening class', 'the corridor before an exam',
      'a dormitory common room', 'an art studio', 'a campus bookshop', 'the office hours of a teacher', 'an orientation day for exchange students',
    ],
    people: ['a classmate', 'a tutor', 'an exchange student', 'a professor', 'a librarian', 'a study partner'],
  },
  opinion: {
    places: [
      'a radio call-in show', 'a neighbourhood meeting', 'a long dinner with friends', 'a debate club', 'a taxi ride',
      'a cafe table after a film', 'a park bench', 'a family lunch', 'a podcast recording', 'a train ride with a newspaper',
    ],
    people: ['someone who enjoys a friendly argument', 'a thoughtful listener', 'a journalist', 'an old friend who sees things differently', 'a curious teenager', 'a neighbour'],
  },
} as const

export type RandomSceneDomain = keyof typeof RANDOM_SCENES

function pick<T>(items: readonly T[], random: () => number) {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))]
}

/** One kind of conversation, with a place and a person that belong to it. */
export function randomScene(random: () => number = Math.random) {
  const domain = pick(Object.keys(RANDOM_SCENES) as RandomSceneDomain[], random)
  const { places, people } = RANDOM_SCENES[domain]
  return { domain, place: `${pick(places, random)}, with ${pick(people, random)}` }
}
