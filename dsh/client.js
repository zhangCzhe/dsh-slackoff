// 静态 npm 插件的客户端半体：不是 ESM `export default`（那是动态 Cordis 插件的格式），
// 而是一个 classic script，必须在加载时通过 window.__ModuleLoader__.load({ id, factory })
// 注册自己。factory(require) 返回 module.exports，依赖通过 require 取（react 等 seed），
// 插件对象以 exports.apply / exports.inject 形式导出。
// 参考实现：@linxin666/dsh-pet 的 lib/client.js。
window.__ModuleLoader__.load({
	id: "dsh-slackoff",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const React = require("react");

		const CSS = `
.vp-set{display:flex;flex-direction:column;gap:8px;padding:10px 0}
.vp-set-label{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}
.vp-set-desc{font-size:12px;color:var(--dsw-alias-label-secondary)}
.vp-set-control{display:flex;gap:6px;align-items:center}
.vp-set-input{flex:1;min-width:0;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:12px;padding:6px 8px;outline:none}
.vp-set-input:focus{border-color:var(--dsw-alias-brand-primary)}
.vp-set-input::placeholder{color:var(--dsw-alias-label-secondary)}
.vp-set-save{border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:12px;padding:6px 12px;cursor:pointer;white-space:nowrap}
.vp-set-save:hover{border-color:var(--dsw-alias-brand-primary)}
.vp-set-check{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-primary);cursor:pointer}
.vp-fish{border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:12px;padding:6px 10px;cursor:pointer;white-space:nowrap}
.vp-fish:hover{border-color:var(--dsw-alias-brand-primary)}
.vp-list{display:flex;flex-direction:column;gap:6px}
.vp-item{display:flex;align-items:center;gap:8px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:6px 8px;cursor:pointer;font-size:12px}
.vp-item:hover{border-color:var(--dsw-alias-brand-primary)}
.vp-item-active{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2)}
.vp-item-url{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary)}
.vp-item-badge{font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.vp-item-active .vp-item-badge{color:var(--dsw-alias-brand-primary)}
.vp-item-del{border:none;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:12px;padding:2px 6px;border-radius:4px}
.vp-item-del:hover{color:var(--dsw-alias-state-error-primary)}
`

		// 同源 JSON 请求：无 body → GET；有 body → POST JSON。对应 host.js 在 /slackoff/* 暴露的端点。
		async function call(method, body) {
			try {
				const response = await fetch('/slackoff/' + method, body === undefined ? {} : {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(body)
				});
				if (!response.ok) return null;
				return await response.json();
			} catch (e) {
				return null;
			}
		}

		function FishConfig() {
			const [targets, setTargets] = React.useState([])
			const [active, setActive] = React.useState('')
			const [newUrl, setNewUrl] = React.useState('')
			const [onlyComplex, setOnlyComplex] = React.useState(false)

			React.useEffect(() => {
				call('get-config').then((r) => {
					if (r) {
						if (Array.isArray(r.targets)) setTargets(r.targets)
						if (typeof r.defaultTarget === 'string') setActive(r.defaultTarget)
						if (typeof r.onlyComplex === 'boolean') setOnlyComplex(r.onlyComplex)
					}
				})
			}, [])

			const apply = (r) => {
				if (!r) return
				if (Array.isArray(r.targets)) setTargets(r.targets)
				if (typeof r.defaultTarget === 'string') setActive(r.defaultTarget)
			}

			const setActiveTarget = (url) => { call('set-target', { url }).then(apply) }
			const addTarget = () => {
				const u = (newUrl || '').trim()
				if (!u) return
				call('add-target', { url: u }).then((r) => { setNewUrl(''); apply(r) })
			}
			const removeTarget = (url) => { call('remove-target', { url }).then(apply) }

			const items = (targets || []).map((url) => {
				const isActive = url === active
				return React.createElement('div', { key: url, className: 'vp-item' + (isActive ? ' vp-item-active' : ''), onClick: () => setActiveTarget(url) },
					React.createElement('span', { className: 'vp-item-url' }, url),
					React.createElement('span', { className: 'vp-item-badge' }, isActive ? '✓ 使用中' : '点击启用'),
					React.createElement('button', { type: 'button', className: 'vp-item-del', title: '移除', onClick: (e) => { e.stopPropagation(); removeTarget(url) } }, '移除'),
				)
			})

			return React.createElement('div', { className: 'vp-set' },
				React.createElement('div', { className: 'vp-set-label' }, '🐟摸鱼配置'),
				React.createElement('div', { className: 'vp-set-desc' }, 'AI 工作时自动打开并小窗播放的站点（点击启用，移除可删除）'),
				React.createElement('div', { className: 'vp-list' }, items),
				React.createElement('div', { className: 'vp-set-control' },
					React.createElement('input', { value: newUrl, placeholder: '输入新站点 URL，点击添加', className: 'vp-set-input', onChange: (e) => setNewUrl(e.target.value) }),
					React.createElement('button', { type: 'button', className: 'vp-set-save', onClick: addTarget }, '添加'),
				),
				React.createElement('label', { className: 'vp-set-check' },
					React.createElement('input', { type: 'checkbox', checked: onlyComplex, onChange: (e) => { setOnlyComplex(e.target.checked); call('set-only-complex', { value: e.target.checked }) } }),
					' 只在复杂任务时开启（简单对话不弹窗）',
				),
			)
		}

		function apply(ctx) {
			// 样式：一次性 <style>，随插件卸载移除。
			ctx.effect(() => {
				if (typeof document === 'undefined' || !document.head) return
				const el = document.createElement('style')
				el.setAttribute('data-plugin', 'dsh-slackoff')
				el.textContent = CSS
				document.head.appendChild(el)
				return () => el.remove()
			}, 'slackoff: styles')

			// 通知 host：客户端已就绪（best-effort）。
			call('ping', {})

			// 输入框右侧的「开始摸鱼」按钮
			ctx.slots.inject('conversation.input.right', () => ctx.slots.register(
				{ name: 'conversation.input.right', id: 'slackoff-fish', order: 0, label: '开始摸鱼' },
				() => React.createElement('button', { type: 'button', className: 'vp-fish', title: '打开/跳转到摸鱼小窗', onClick: () => call('open-fish', {}) }, '🐟 开始摸鱼'),
			))

			// 设置 → 通用 里的摸鱼配置面板
			ctx.slots.inject('settings.general.item', () => ctx.slots.register(
				{ name: 'settings.general.item', id: 'slackoff-target', order: 30 },
				() => React.createElement(FishConfig),
			))
		}

		exports.apply = apply
		exports.inject = ['slots']
		return module.exports
	}
})
