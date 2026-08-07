import type { Post } from '@/types/post'
import { v4 as uuidv4 } from 'uuid'
import DEFAULT_CONTENT from '@/assets/example/markdown.md?raw'
import { addPrefix } from '@/utils'

export type { Post } from '@/types/post'

const LEGACY_POSTS_KEY = addPrefix(`posts`)
const LEGACY_CURRENT_POST_KEY = addPrefix(`current_post_id`)
const LEGACY_RECENT_POSTS_KEY = addPrefix(`recent_post_ids`)

function defaultPosts(): Post[] {
  const now = new Date()
  return [{
    id: uuidv4(),
    title: `内容1`,
    content: DEFAULT_CONTENT,
    history: [
      { datetime: now.toLocaleString(`zh-cn`), content: DEFAULT_CONTENT },
    ],
    createDatetime: now,
    updateDatetime: now,
  }]
}

function readLegacyJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : fallback
  }
  catch {
    return fallback
  }
}

function readLegacyString(key: string): string {
  try {
    return localStorage.getItem(key) ?? ``
  }
  catch {
    return ``
  }
}

/**
 * 文章管理 Store
 * 负责管理文章列表、当前文章、文章 CRUD 操作
 *
 * Post 仍是所有编辑器组件共享的响应式模型；持久化由
 * documentWorkspace Store 按 guest / user:<id> 分区接管。这里仅同步读取旧
 * localStorage，避免账号文档继续写进未分区的旧键。
 */
export const usePostStore = defineStore(`post`, () => {
  // 旧版数据只作为 guest 首次迁移输入，后续保存由 DocumentWorkspaceRepository 负责。
  const posts = ref<Post[]>(readLegacyJson<Post[]>(LEGACY_POSTS_KEY, defaultPosts()))

  // 当前文章 ID
  const currentPostId = ref(readLegacyString(LEGACY_CURRENT_POST_KEY))
  const recentPostIds = ref(readLegacyJson<string[]>(LEGACY_RECENT_POSTS_KEY, []))

  // 在补齐 id 后，若 currentPostId 无效 ➜ 自动指向第一篇
  onBeforeMount(() => {
    posts.value = posts.value.map((post, index) => {
      const now = Date.now()
      return {
        ...post,
        id: post.id ?? uuidv4(),
        history: Array.isArray(post.history) ? post.history : [],
        createDatetime: new Date(post.createDatetime ?? now + index),
        updateDatetime: new Date(post.updateDatetime ?? now + index),
      }
    })

    // 兼容：如果本地没有 currentPostId，或指向的文章已不存在
    if (!currentPostId.value || !posts.value.some(p => p.id === currentPostId.value)) {
      currentPostId.value = posts.value[0]?.id ?? ``
    }
  })

  // 根据 id 找索引
  const findIndexById = (id: string) => posts.value.findIndex(p => p.id === id)

  // computed: 让旧代码还能用 index，但底层映射 id
  const currentPostIndex = computed<number>({
    get: () => findIndexById(currentPostId.value),
    set: (idx) => {
      if (idx >= 0 && idx < posts.value.length) {
        currentPostId.value = posts.value[idx].id
      }
    },
  })

  // 获取 Post
  const getPostById = (id: string) => posts.value.find(p => p.id === id)

  // 获取当前文章
  const currentPost = computed(() => getPostById(currentPostId.value))

  const recentPosts = computed(() => {
    return recentPostIds.value
      .map(id => getPostById(id))
      .filter((post): post is Post => Boolean(post))
      .slice(0, 5)
  })

  function touchRecentPost(id: string) {
    if (!id || !posts.value.some(p => p.id === id))
      return

    recentPostIds.value = [
      id,
      ...recentPostIds.value.filter(item => item !== id && posts.value.some(p => p.id === item)),
    ].slice(0, 10)
  }

  watch(currentPostId, (id) => {
    touchRecentPost(id)
  }, { immediate: true })

  // 添加文章
  const addPost = (title: string, parentId: string | null = null, initialContent?: string) => {
    const content = initialContent ?? `# ${title}`
    const newPost: Post = {
      id: uuidv4(),
      title,
      content,
      history: [
        { datetime: new Date().toLocaleString(`zh-cn`), content },
      ],
      createDatetime: new Date(),
      updateDatetime: new Date(),
      parentId,
    }
    posts.value.push(newPost)
    currentPostId.value = newPost.id
    return newPost
  }

  // 重命名文章
  const renamePost = (id: string, title: string) => {
    const post = getPostById(id)
    if (post) {
      post.title = title
      post.updateDatetime = new Date()
    }
  }

  // 删除文章
  const delPost = (id: string, recursive: boolean = false) => {
    const post = getPostById(id)
    if (!post)
      return

    if (recursive) {
      const getChildIds = (parentId: string): string[] => {
        const children = posts.value.filter(p => p.parentId === parentId)
        return children.reduce((acc, child) => {
          return acc.concat(child.id, getChildIds(child.id))
        }, [] as string[])
      }

      const allIdsToDelete = [id, ...getChildIds(id)]
      allIdsToDelete.forEach((toDelId) => {
        const idx = findIndexById(toDelId)
        if (idx !== -1) {
          posts.value.splice(idx, 1)
        }
      })
      recentPostIds.value = recentPostIds.value.filter(item => !allIdsToDelete.includes(item))

      if (!posts.value.some(p => p.id === currentPostId.value)) {
        currentPostId.value = posts.value[Math.max(0, posts.value.length - 1)]?.id ?? ``
      }
      return
    }

    // 子内容挂靠到父级的父级
    const newParentId = post.parentId ?? null
    posts.value.forEach((p) => {
      if (p.parentId === id) {
        p.parentId = newParentId
        p.updateDatetime = new Date()
      }
    })

    const idx = findIndexById(id)
    if (idx === -1)
      return

    posts.value.splice(idx, 1)
    recentPostIds.value = recentPostIds.value.filter(item => item !== id)
    currentPostId.value = posts.value[Math.min(idx, posts.value.length - 1)]?.id ?? ``
  }

  // 更新文章父 ID
  const updatePostParentId = (postId: string, parentId: string | null) => {
    const post = getPostById(postId)
    if (post) {
      post.parentId = parentId
      post.updateDatetime = new Date()
    }
  }

  // 更新文章内容
  const updatePostContent = (id: string, content: string) => {
    const post = getPostById(id)
    if (post) {
      post.content = content
      post.updateDatetime = new Date()
    }
  }

  // 收起所有文章
  const collapseAllPosts = () => {
    posts.value.forEach((post) => {
      post.collapsed = true
    })
  }

  // 展开所有文章
  const expandAllPosts = () => {
    posts.value.forEach((post) => {
      post.collapsed = false
    })
  }

  /**
   * 账号分区切换的唯一入口。编辑器只看到替换后的 Post，不需要了解存储 Scope。
   */
  function replacePosts(nextPosts: Post[], nextCurrentPostId = ``, nextRecentPostIds: string[] = []): void {
    posts.value = nextPosts
    const requestedId = nextCurrentPostId
    currentPostId.value = requestedId && nextPosts.some(post => post.id === requestedId)
      ? requestedId
      : nextPosts[0]?.id ?? ``
    recentPostIds.value = nextRecentPostIds
      .filter(id => nextPosts.some(post => post.id === id))
      .slice(0, 10)
  }

  /**
   * 只为 guest 镜像旧键，使升级前的数据能迁入、必要时也能降级读取。
   * 账号 Scope 绝不能调用它，否则会破坏账号隔离。
   */
  function persistLegacySnapshot(
    snapshotPosts: Post[] = posts.value,
    snapshotCurrentPostId = currentPostId.value,
    snapshotRecentPostIds: string[] = recentPostIds.value,
  ): void {
    try {
      localStorage.setItem(LEGACY_POSTS_KEY, JSON.stringify(snapshotPosts))
      localStorage.setItem(LEGACY_CURRENT_POST_KEY, snapshotCurrentPostId)
      localStorage.setItem(LEGACY_RECENT_POSTS_KEY, JSON.stringify(snapshotRecentPostIds))
    }
    catch {
      // IndexedDB 仍是主存储；旧键镜像失败不影响正常写作。
    }
  }

  return {
    // State
    posts,
    currentPostId,
    currentPostIndex,
    currentPost,
    recentPostIds,
    recentPosts,

    // Getters
    getPostById,
    findIndexById,

    // Actions
    addPost,
    renamePost,
    delPost,
    updatePostParentId,
    updatePostContent,
    touchRecentPost,
    collapseAllPosts,
    expandAllPosts,
    replacePosts,
    persistLegacySnapshot,
  }
})
