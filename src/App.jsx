import { useEffect, useMemo, useState } from 'react'
import { CATEGORIES, DEMO_POSTS, DEMO_USERS, LEVELS } from './data/seed'
import { findMatches } from './lib/match'
import { loadState, saveState, uid } from './lib/storage'

const TABS = [
  { id: 'plaza', label: '技能广场' },
  { id: 'match', label: '智能匹配' },
  { id: 'publish', label: '发布技能' },
  { id: 'inbox', label: '互换消息' },
  { id: 'me', label: '我的主页' },
]

function avatarOf(name) {
  return (name || '?').trim().slice(0, 1)
}

export default function App() {
  const [state, setState] = useState(() => loadState())
  const [tab, setTab] = useState('plaza')
  const [filter, setFilter] = useState({ q: '', type: 'all', category: 'all' })
  const [toast, setToast] = useState('')
  const [setupOpen, setSetupOpen] = useState(false)

  useEffect(() => {
    setState((prev) => {
      const needsSeed = !prev.seeded || !prev.posts?.length
      if (!needsSeed && prev.demoUsers?.length) return prev
      const mine = (prev.posts || []).filter((p) => prev.profile && p.userId === prev.profile.id)
      const next = {
        ...prev,
        posts: [...DEMO_POSTS, ...mine],
        seeded: true,
        demoUsers: DEMO_USERS,
      }
      saveState(next)
      return next
    })
  }, [])

  useEffect(() => {
    saveState(state)
  }, [state])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2200)
    return () => clearTimeout(t)
  }, [toast])

  const demoUsers = state.demoUsers || DEMO_USERS
  const usersById = useMemo(() => {
    const map = Object.fromEntries(demoUsers.map((u) => [u.id, u]))
    if (state.profile) map[state.profile.id] = state.profile
    return map
  }, [demoUsers, state.profile])

  const myPosts = useMemo(
    () => state.posts.filter((p) => state.profile && p.userId === state.profile.id),
    [state.posts, state.profile],
  )

  const matches = useMemo(() => {
    if (!state.profile) return []
    return findMatches(myPosts, state.posts, usersById, state.profile.id)
  }, [myPosts, state.posts, usersById, state.profile])

  const filteredPosts = useMemo(() => {
    const q = filter.q.trim().toLowerCase()
    return [...state.posts]
      .filter((p) => (filter.type === 'all' ? true : p.type === filter.type))
      .filter((p) => (filter.category === 'all' ? true : p.category === filter.category))
      .filter((p) => {
        if (!q) return true
        const user = usersById[p.userId]
        return [p.skill, p.description, p.category, ...(p.tags || []), user?.name, user?.city]
          .join(' ')
          .toLowerCase()
          .includes(q)
      })
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  }, [state.posts, filter, usersById])

  const stats = {
    teach: state.posts.filter((p) => p.type === 'teach').length,
    learn: state.posts.filter((p) => p.type === 'learn').length,
    swaps: state.exchanges.filter((e) => e.status !== 'rejected').length,
    matches: matches.length,
  }

  function requireProfile(action) {
    if (state.profile) return true
    setSetupOpen(true)
    setToast('先创建你的主页，再' + action)
    return false
  }

  function createProfile(form) {
    const profile = {
      id: uid('u'),
      name: form.name.trim(),
      city: form.city.trim() || '未填写',
      bio: form.bio.trim() || '热爱分享，也想持续学习。',
      avatar: avatarOf(form.name),
    }
    setState((s) => ({ ...s, profile }))
    setSetupOpen(false)
    setToast('主页已创建，可以开始发布技能了')
    setTab('publish')
  }

  function addPost(form) {
    if (!requireProfile('发布')) return
    const post = {
      id: uid('p'),
      userId: state.profile.id,
      type: form.type,
      skill: form.skill.trim(),
      category: form.category,
      level: form.level,
      mode: form.mode.trim() || '线上/线下',
      duration: form.duration.trim() || '协商',
      tags: form.tags
        .split(/[,，、\s]+/)
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 5),
      description: form.description.trim(),
      createdAt: new Date().toISOString(),
    }
    setState((s) => ({ ...s, posts: [post, ...s.posts] }))
    setToast(form.type === 'teach' ? '已发布：我能教的技能' : '已发布：我想学的技能')
    setTab('plaza')
  }

  function proposeSwap(match) {
    if (!requireProfile('发起互换')) return
    if (!match.theirTeach && !match.theirLearn) return
    const existing = state.exchanges.find(
      (e) =>
        e.toUserId === match.userId &&
        e.fromUserId === state.profile.id &&
        (e.status === 'pending' || e.status === 'accepted'),
    )
    if (existing) {
      setToast('已有进行中的互换，去「互换消息」查看')
      setTab('inbox')
      return
    }
    const exchange = {
      id: uid('ex'),
      fromUserId: state.profile.id,
      toUserId: match.userId,
      offerSkill: match.myTeach?.skill || myPosts.find((p) => p.type === 'teach')?.skill || '待补充',
      wantSkill: match.theirTeach?.skill || match.myLearn?.skill || '待协商',
      note: match.reasons?.[0] || '希望互相教学，共同进步',
      status: 'pending',
      createdAt: new Date().toISOString(),
    }
    setState((s) => ({ ...s, exchanges: [exchange, ...s.exchanges] }))
    setToast('互换请求已发送')
    setTab('inbox')
  }

  function proposeFromPost(post) {
    if (!requireProfile('发起互换')) return
    if (post.userId === state.profile.id) {
      setToast('不能和自己互换')
      return
    }
    const myTeach = myPosts.find((p) => p.type === 'teach')
    const exchange = {
      id: uid('ex'),
      fromUserId: state.profile.id,
      toUserId: post.userId,
      offerSkill: myTeach?.skill || '我可教的技能（稍后补充）',
      wantSkill: post.type === 'teach' ? post.skill : post.skill,
      note:
        post.type === 'teach'
          ? `想向你学习「${post.skill}」，也愿意用我的技能交换`
          : `看到你想学「${post.skill}」，我可以教，也希望交换学习`,
      status: 'pending',
      createdAt: new Date().toISOString(),
    }
    setState((s) => ({ ...s, exchanges: [exchange, ...s.exchanges] }))
    setToast('互换请求已发送')
    setTab('inbox')
  }

  function updateExchange(id, status) {
    setState((s) => ({
      ...s,
      exchanges: s.exchanges.map((e) => (e.id === id ? { ...e, status } : e)),
    }))
    setToast(status === 'accepted' ? '已接受互换' : status === 'completed' ? '已标记完成' : '已拒绝')
  }

  function resetDemo() {
    const next = {
      profile: state.profile,
      posts: DEMO_POSTS.concat(myPosts),
      exchanges: state.exchanges.filter((e) => e.fromUserId === state.profile?.id || e.toUserId === state.profile?.id),
      seeded: true,
      demoUsers: DEMO_USERS,
    }
    setState(next)
    setToast('演示数据已刷新')
  }

  return (
    <div className="app">
      <div className="bg-orb orb-a" aria-hidden />
      <div className="bg-orb orb-b" aria-hidden />

      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark">SkillSwap</span>
          <span className="brand-zh">技能互换</span>
        </div>
        <div className="top-actions">
          {state.profile ? (
            <button className="ghost-btn" onClick={() => setTab('me')}>
              <span className="mini-avatar">{state.profile.avatar}</span>
              {state.profile.name}
            </button>
          ) : (
            <button className="primary-btn" onClick={() => setSetupOpen(true)}>
              创建主页
            </button>
          )}
        </div>
      </header>

      <section className="hero">
        <p className="eyebrow">用你会的，换你想学的</p>
        <h1>技能互换平台</h1>
        <p className="lede">
          报班贵、自学难坚持？把「我能教的」和「我想学的」挂出来，系统帮你找到互补的人，一对一交换成长。
        </p>
        <div className="hero-cta">
          <button className="primary-btn" onClick={() => (state.profile ? setTab('publish') : setSetupOpen(true))}>
            {state.profile ? '发布技能' : '开始使用'}
          </button>
          <button className="ghost-btn" onClick={() => setTab('match')}>
            查看匹配
          </button>
        </div>
        <div className="stat-row">
          <div><strong>{stats.teach}</strong><span>可教技能</span></div>
          <div><strong>{stats.learn}</strong><span>想学技能</span></div>
          <div><strong>{stats.matches}</strong><span>当前匹配</span></div>
          <div><strong>{stats.swaps}</strong><span>互换进行中</span></div>
        </div>
      </section>

      <nav className="tabs" aria-label="主导航">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? 'tab active' : 'tab'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === 'inbox' && state.exchanges.some((e) => e.status === 'pending') ? (
              <i className="dot" />
            ) : null}
          </button>
        ))}
      </nav>

      <main className="panel">
        {tab === 'plaza' && (
          <Plaza
            posts={filteredPosts}
            usersById={usersById}
            filter={filter}
            setFilter={setFilter}
            me={state.profile}
            onPropose={proposeFromPost}
          />
        )}
        {tab === 'match' && (
          <MatchBoard
            profile={state.profile}
            matches={matches}
            myPosts={myPosts}
            onSetup={() => setSetupOpen(true)}
            onPublish={() => setTab('publish')}
            onPropose={proposeSwap}
          />
        )}
        {tab === 'publish' && (
          <PublishForm
            profile={state.profile}
            onSetup={() => setSetupOpen(true)}
            onSubmit={addPost}
          />
        )}
        {tab === 'inbox' && (
          <Inbox
            exchanges={state.exchanges}
            usersById={usersById}
            me={state.profile}
            onUpdate={updateExchange}
            onSetup={() => setSetupOpen(true)}
          />
        )}
        {tab === 'me' && (
          <Me
            profile={state.profile}
            posts={myPosts}
            exchanges={state.exchanges}
            onSetup={() => setSetupOpen(true)}
            onReset={resetDemo}
            onClearProfile={() => {
              setState((s) => ({ ...s, profile: null }))
              setToast('已退出本地主页')
            }}
          />
        )}
      </main>

      <footer className="footer">
        <span>SkillSwap 雏形 · 数据保存在本机浏览器</span>
        <a href="https://github.com/zixuanxiao-torch/AI-Test" target="_blank" rel="noreferrer">
          GitHub
        </a>
      </footer>

      {setupOpen && (
        <Modal title="创建你的学习主页" onClose={() => setSetupOpen(false)}>
          <ProfileForm onSubmit={createProfile} />
        </Modal>
      )}

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  )
}

function Plaza({ posts, usersById, filter, setFilter, me, onPropose }) {
  return (
    <div className="stack">
      <div className="section-head">
        <div>
          <h2>技能广场</h2>
          <p>浏览大家发布的「能教 / 想学」，一键发起互换。</p>
        </div>
      </div>
      <div className="filters">
        <input
          value={filter.q}
          onChange={(e) => setFilter({ ...filter, q: e.target.value })}
          placeholder="搜索技能、城市、标签…"
        />
        <select value={filter.type} onChange={(e) => setFilter({ ...filter, type: e.target.value })}>
          <option value="all">全部类型</option>
          <option value="teach">我能教</option>
          <option value="learn">我想学</option>
        </select>
        <select
          value={filter.category}
          onChange={(e) => setFilter({ ...filter, category: e.target.value })}
        >
          <option value="all">全部分类</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="grid">
        {posts.map((post) => {
          const user = usersById[post.userId]
          return (
            <article key={post.id} className="skill-card">
              <div className="card-top">
                <span className={post.type === 'teach' ? 'badge teach' : 'badge learn'}>
                  {post.type === 'teach' ? '我能教' : '我想学'}
                </span>
                <span className="muted">{post.category}</span>
              </div>
              <h3>{post.skill}</h3>
              <p className="desc">{post.description}</p>
              <div className="meta">
                <span>{post.level}</span>
                <span>{post.mode}</span>
                <span>{post.duration}</span>
              </div>
              <div className="tags">
                {(post.tags || []).map((t) => (
                  <span key={t}>#{t}</span>
                ))}
              </div>
              <div className="card-foot">
                <div className="person">
                  <span className="mini-avatar">{user?.avatar || '?'}</span>
                  <div>
                    <strong>{user?.name || '匿名'}</strong>
                    <small>{user?.city}</small>
                  </div>
                </div>
                {me?.id !== post.userId ? (
                  <button className="primary-btn sm" onClick={() => onPropose(post)}>
                    发起互换
                  </button>
                ) : (
                  <span className="muted">我的发布</span>
                )}
              </div>
            </article>
          )
        })}
      </div>
      {!posts.length && <Empty text="没有符合条件的技能，试试换个关键词。" />}
    </div>
  )
}

function MatchBoard({ profile, matches, myPosts, onSetup, onPublish, onPropose }) {
  if (!profile) {
    return (
      <Empty
        text="创建主页并发布「能教 + 想学」后，这里会出现互补匹配。"
        actionLabel="创建主页"
        onAction={onSetup}
      />
    )
  }
  if (myPosts.length < 1) {
    return (
      <Empty
        text="先发布至少一项技能，系统才能开始匹配。"
        actionLabel="去发布"
        onAction={onPublish}
      />
    )
  }
  return (
    <div className="stack">
      <div className="section-head">
        <div>
          <h2>智能匹配</h2>
          <p>优先展示「你能教对方想学、对方能教你想学」的双向互补。</p>
        </div>
      </div>
      <div className="match-list">
        {matches.map((m) => (
          <article key={m.userId} className="match-card">
            <div className="match-head">
              <div className="person">
                <span className="mini-avatar lg">{m.user.avatar}</span>
                <div>
                  <strong>{m.user.name}</strong>
                  <small>{m.user.city} · {m.user.bio}</small>
                </div>
              </div>
              <div className="score">匹配度 {Math.min(99, Math.round(m.score))}%</div>
            </div>
            <ul className="reasons">
              {m.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <div className="swap-preview">
              <div>
                <span className="badge teach">你教</span>
                <strong>{m.myTeach?.skill || '待补充可教技能'}</strong>
              </div>
              <span className="arrow">⇄</span>
              <div>
                <span className="badge learn">你学</span>
                <strong>{m.theirTeach?.skill || m.myLearn?.skill || '待协商'}</strong>
              </div>
            </div>
            <button className="primary-btn" onClick={() => onPropose(m)}>
              向 {m.user.name} 发起互换
            </button>
          </article>
        ))}
      </div>
      {!matches.length && (
        <Empty
          text="暂无高匹配。试试发布更具体的技能名，或到广场主动发起。"
          actionLabel="去发布"
          onAction={onPublish}
        />
      )}
    </div>
  )
}

function PublishForm({ profile, onSetup, onSubmit }) {
  const [form, setForm] = useState({
    type: 'teach',
    skill: '',
    category: CATEGORIES[0],
    level: LEVELS[1],
    mode: '线上/线下',
    duration: '1 小时/次',
    tags: '',
    description: '',
  })

  if (!profile) {
    return (
      <Empty text="发布前需要先创建主页。" actionLabel="创建主页" onAction={onSetup} />
    )
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.skill.trim() || !form.description.trim()) return
    onSubmit(form)
    setForm((f) => ({ ...f, skill: '', tags: '', description: '' }))
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <div className="section-head">
        <div>
          <h2>发布技能</h2>
          <p>建议同时发布「我能教」和「我想学」，匹配会更准。</p>
        </div>
      </div>
      <div className="segment">
        <button
          type="button"
          className={form.type === 'teach' ? 'active' : ''}
          onClick={() => setForm({ ...form, type: 'teach' })}
        >
          我能教
        </button>
        <button
          type="button"
          className={form.type === 'learn' ? 'active' : ''}
          onClick={() => setForm({ ...form, type: 'learn' })}
        >
          我想学
        </button>
      </div>
      <label>
        技能名称
        <input
          value={form.skill}
          onChange={(e) => setForm({ ...form, skill: e.target.value })}
          placeholder={form.type === 'teach' ? '例如：木吉他弹唱' : '例如：城市街拍'}
          required
        />
      </label>
      <div className="two-col">
        <label>
          分类
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          水平
          <select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}>
            {LEVELS.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="two-col">
        <label>
          方式
          <input value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })} />
        </label>
        <label>
          时长
          <input value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} />
        </label>
      </div>
      <label>
        标签（逗号分隔）
        <input
          value={form.tags}
          onChange={(e) => setForm({ ...form, tags: e.target.value })}
          placeholder="和弦, 节奏, 跟练"
        />
      </label>
      <label>
        说明
        <textarea
          rows={4}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="你能提供什么，或你希望怎么学？"
          required
        />
      </label>
      <button className="primary-btn" type="submit">
        发布到广场
      </button>
    </form>
  )
}

function Inbox({ exchanges, usersById, me, onUpdate, onSetup }) {
  if (!me) {
    return <Empty text="登录本地主页后可管理互换请求。" actionLabel="创建主页" onAction={onSetup} />
  }
  const mine = exchanges.filter((e) => e.fromUserId === me.id || e.toUserId === me.id)
  return (
    <div className="stack">
      <div className="section-head">
        <div>
          <h2>互换消息</h2>
          <p>接受后可约时间开课；完成后标记，形成信用闭环。</p>
        </div>
      </div>
      <div className="inbox-list">
        {mine.map((ex) => {
          const otherId = ex.fromUserId === me.id ? ex.toUserId : ex.fromUserId
          const other = usersById[otherId]
          const incoming = ex.toUserId === me.id
          return (
            <article key={ex.id} className="inbox-card">
              <div className="card-top">
                <span className={`status ${ex.status}`}>{statusLabel(ex.status)}</span>
                <span className="muted">{new Date(ex.createdAt).toLocaleString('zh-CN')}</span>
              </div>
              <h3>
                {incoming ? '收到' : '发出'} · 与 {other?.name || '用户'} 的互换
              </h3>
              <div className="swap-preview">
                <div>
                  <span className="badge teach">提供</span>
                  <strong>{ex.offerSkill}</strong>
                </div>
                <span className="arrow">⇄</span>
                <div>
                  <span className="badge learn">换取</span>
                  <strong>{ex.wantSkill}</strong>
                </div>
              </div>
              <p className="desc">{ex.note}</p>
              <div className="row-actions">
                {incoming && ex.status === 'pending' && (
                  <>
                    <button className="primary-btn sm" onClick={() => onUpdate(ex.id, 'accepted')}>
                      接受
                    </button>
                    <button className="ghost-btn sm" onClick={() => onUpdate(ex.id, 'rejected')}>
                      拒绝
                    </button>
                  </>
                )}
                {ex.status === 'accepted' && (
                  <button className="primary-btn sm" onClick={() => onUpdate(ex.id, 'completed')}>
                    标记完成
                  </button>
                )}
              </div>
            </article>
          )
        })}
      </div>
      {!mine.length && <Empty text="还没有互换消息。去匹配页或广场发起吧。" />}
    </div>
  )
}

function Me({ profile, posts, exchanges, onSetup, onReset, onClearProfile }) {
  if (!profile) {
    return <Empty text="你还没有主页。" actionLabel="创建主页" onAction={onSetup} />
  }
  return (
    <div className="stack">
      <div className="profile-hero">
        <span className="mini-avatar xl">{profile.avatar}</span>
        <div>
          <h2>{profile.name}</h2>
          <p>{profile.city} · {profile.bio}</p>
        </div>
      </div>
      <div className="two-col tight">
        <div className="soft-card">
          <h3>我的发布（{posts.length}）</h3>
          <ul className="plain-list">
            {posts.map((p) => (
              <li key={p.id}>
                <span className={p.type === 'teach' ? 'badge teach' : 'badge learn'}>
                  {p.type === 'teach' ? '教' : '学'}
                </span>
                {p.skill}
              </li>
            ))}
            {!posts.length && <li className="muted">暂无发布</li>}
          </ul>
        </div>
        <div className="soft-card">
          <h3>互换概况</h3>
          <ul className="plain-list">
            <li>进行中：{exchanges.filter((e) => e.status === 'accepted').length}</li>
            <li>待处理：{exchanges.filter((e) => e.status === 'pending').length}</li>
            <li>已完成：{exchanges.filter((e) => e.status === 'completed').length}</li>
          </ul>
        </div>
      </div>
      <div className="row-actions">
        <button className="ghost-btn" onClick={onReset}>刷新演示数据</button>
        <button className="ghost-btn" onClick={onClearProfile}>清除本地主页</button>
      </div>
    </div>
  )
}

function ProfileForm({ onSubmit }) {
  const [form, setForm] = useState({ name: '', city: '', bio: '' })
  return (
    <form
      className="form compact"
      onSubmit={(e) => {
        e.preventDefault()
        if (!form.name.trim()) return
        onSubmit(form)
      }}
    >
      <label>
        昵称
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="怎么称呼你"
          required
        />
      </label>
      <label>
        城市
        <input
          value={form.city}
          onChange={(e) => setForm({ ...form, city: e.target.value })}
          placeholder="上海 / 线上也可"
        />
      </label>
      <label>
        一句话介绍
        <textarea
          rows={3}
          value={form.bio}
          onChange={(e) => setForm({ ...form, bio: e.target.value })}
          placeholder="你擅长什么，想交换什么？"
        />
      </label>
      <button className="primary-btn" type="submit">进入平台</button>
    </form>
  )
}

function Modal({ title, children, onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Empty({ text, actionLabel, onAction }) {
  return (
    <div className="empty">
      <p>{text}</p>
      {actionLabel ? (
        <button className="primary-btn" onClick={onAction}>{actionLabel}</button>
      ) : null}
    </div>
  )
}

function statusLabel(status) {
  return {
    pending: '待回应',
    accepted: '已接受',
    rejected: '已拒绝',
    completed: '已完成',
  }[status] || status
}
