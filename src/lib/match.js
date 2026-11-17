function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\s+/g, '')
}

function overlapScore(a, b) {
  const na = normalize(a)
  const nb = normalize(b)
  if (!na || !nb) return 0
  if (na === nb) return 40
  if (na.includes(nb) || nb.includes(na)) return 28
  const tagsA = na.split(/[\/、,，+]/).filter(Boolean)
  let score = 0
  for (const t of tagsA) {
    if (t.length >= 2 && nb.includes(t)) score += 10
  }
  return Math.min(score, 30)
}

/** Complementary match: my teach ↔ their learn, and my learn ↔ their teach */
export function findMatches(myPosts, allPosts, usersById, myUserId) {
  const myTeach = myPosts.filter((p) => p.type === 'teach')
  const myLearn = myPosts.filter((p) => p.type === 'learn')
  const others = allPosts.filter((p) => p.userId !== myUserId)

  const pairs = new Map()

  for (const teach of myTeach) {
    for (const want of others.filter((p) => p.type === 'learn')) {
      const skillScore = overlapScore(teach.skill, want.skill) + overlapScore(teach.category, want.category)
      if (skillScore < 10) continue
      const key = want.userId
      const prev = pairs.get(key) || {
        userId: key,
        score: 0,
        reasons: [],
        theirTeach: null,
        theirLearn: null,
        myTeach: null,
        myLearn: null,
      }
      prev.score += skillScore + 15
      prev.myTeach = teach
      prev.theirLearn = want
      prev.reasons.push(`你能教「${teach.skill}」，对方想学`)
      pairs.set(key, prev)
    }
  }

  for (const learn of myLearn) {
    for (const offer of others.filter((p) => p.type === 'teach')) {
      const skillScore = overlapScore(learn.skill, offer.skill) + overlapScore(learn.category, offer.category)
      if (skillScore < 10) continue
      const key = offer.userId
      const prev = pairs.get(key) || {
        userId: key,
        score: 0,
        reasons: [],
        theirTeach: null,
        theirLearn: null,
        myTeach: null,
        myLearn: null,
      }
      prev.score += skillScore + 15
      prev.myLearn = learn
      prev.theirTeach = offer
      prev.reasons.push(`你想学「${learn.skill}」，对方能教`)
      pairs.set(key, prev)
    }
  }

  return [...pairs.values()]
    .map((m) => {
      const bothWays = m.myTeach && m.theirTeach && m.myLearn && m.theirLearn
      if (bothWays) {
        m.score += 25
        m.reasons.unshift('双向互补：最适合技能互换')
      }
      m.user = usersById[m.userId]
      m.reasons = [...new Set(m.reasons)]
      return m
    })
    .filter((m) => m.user)
    .sort((a, b) => b.score - a.score)
}
