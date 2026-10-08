---
title: 伸展树の反击 / Leafy-Splay 横空出世
description: 分析 Splay 与 Treap 的常数开销，讨论旋转和懒标记的优化，并介绍 Leafy-Splay 的结构及基本操作。
pubDate: 2023-03-15
tags: [algorithms, data-structures, splay-trees]
draft: false
---

## 前情提要

![Splay 与 Treap 的常数对比背景](https://cdn.luogu.com.cn/upload/image_hosting/ijllhtpr.png)

## 前言

相信大家都听说过 $\text{Splay}$ 的常数大。

相信大家都听说过 $\text{FHQ-Treap}$ 的常数小。

但是现在我要说的是：你说得对，但是你说得不对。

## 所谓常数

一般测试代码的常数，我们会直接生成一组数据直接跑，根据运行时间来估测。[这里](https://www.luogu.com.cn/paste/3b0klr34)就是一些测试记录（后文简称其“测试”）。

可以发现，在运行时间这一块，结果和你所想象和认为的一样：$\text{Treap}$ 比 $\text{Splay}$ 跑得快。这点我不否认，毋庸置疑的，测试结果摆在这里。

但是，你可以看见，我们记录了额外的东西：pushup 的调用次数。

把这个 pushup 调用次数放上来，结果可就大不相同了。$\text{Treap}$ 的 pushup 次数大于 $\text{Splay}$ 的两倍，从这个角度上来看，$\text{Treap}$ 的常数是远远劣于 $\text{Splay}$ 的！

在我们实际使用平衡树的时候，我们的 pushup 绝大多数时候不会是简单的更新子树大小（当然我们也会有 lazytag 和 pushdown 等操作，但一般而言，pushdown 和 pushup 的调用次数是相当的）。$\text{Splay}$ 的常数主要来源是它的维护方式：$\text{Splay}$ 节点需要维护左右儿子和父亲三个指针，在旋转的时候有一系列复杂的操作，会因为内存访问等原因使得速度较慢。

在这个测试中，因为维护的信息十分简单，运行时间的瓶颈就在平衡树形态维护上面了。但是如果维护的信息复杂起来，合并的复杂度高起来（比如，你在维护最大子段和，又或者你需要打区间翻转标记），瓶颈就会转移到 pushup 的调用次数上。这时候，$\text{Splay}$ 就会显现出优势。

:::remark[平衡树的选择]
所以我们可以得到结论：如果你的平衡树仅仅是维护有序集合，那么用 $\text{Treap}$ 是比 $\text{Splay}$ 优秀的。但若是要维护区间信息，进行区间操作，还是用 $\text{Splay}$ 会更好一些。

找不到除了 yyds 之外的形容词来描述 $\text{RB Tree}$。

你应该发现那里面有个叫做 $\text{Leafy-Splay}$ 的怪物，这个后文会提到。

:::

## 常数优化

接下来会提一些 Splay 的常数优化。

### 储存结构

首先是储存儿子指针，大部分人会写成 `int ch[2],fa;`，原因是这样在旋转的时候可以减少一些讨论。

但是我建议大家直接写成 `int lc,rc,fa;`，原因有两个：反复取下标运算其实是一件浪费的事情，速度会慢，具体会慢多少没有测量过，但是的确是慢的；在进行树上的操作时候，经常需要访问左右儿子指针，这时候 `ch[0],ch[1]` 就会显得冗长而不直观，使用 `lc,rc` 会好很多。

下面是一段使用 `lc,rc` 储存的 $\operatorname{ROTATE}$ 操作代码（使用了指针）：

```cpp
inline void rotate(pNode i)
{
    pNode f=i->fa,gf=f->fa;
    pushdown(f),pushdown(i);
    if(islc(i)) f->lc=i->rc,i->rc=f,f->lc&&(f->lc->fa=f);
    else f->rc=i->lc,i->lc=f,f->rc&&(f->rc->fa=f);
    if(gf) (islc(f)?gf->lc:gf->rc)=i;
    f->fa=i,i->fa=gf;
    pushup(f),pushup(i);
}
```

`pNode` 是指向节点的指针，`islc(i)` 判断节点 $i$ 是不是左儿子。

于是你就会发现，代码并没有复杂多少！如果在使用数组而非指针的情况下，代码可以省略空指针判断部分，甚至能够更短。

### 你需要 pushup 吗？

废话，当然需要。

但是你先别急，我们把代码改成这样：

```cpp
inline void rotate(pNode i)
{
    pNode f=i->fa,gf=f->fa;
    pushdown(f),pushdown(i);
    if(islc(i)) f->lc=i->rc,i->rc=f,f->lc&&(f->lc->fa=f);
    else f->rc=i->lc,i->lc=f,f->rc&&(f->rc->fa=f);
    if(gf) (islc(f)?gf->lc:gf->rc)=i;
    f->fa=i,i->fa=gf,pushup(f);
}
inline void splay(pNode x,pNode goal=nullptr)
{
    for(pNode f;(f=x->fa)!=goal;rotate(x))
        if(f->fa!=goal)
            rotate(islc(f)==islc(x)?f:x);
    pushup(x),goal||(rt=x);
}
```

$\operatorname{ROTATE}$ 操作内的 pushup 次数降到了一次，但是仍然保证正确性。

仔细分析，在进行 $\operatorname{ROTATE}(x)$ 的时候，会把 $x$ 的父亲节点“扔出”$x$ 到根的链，而 $x$ 则继续往上“攀爬”。因为 $x$ 一直在往上爬，所以我们可以等到最后更新 $x$ 的信息，$\operatorname{ROTATE}$ 的时候就只需要 pushup 原父亲节点了。

具体的分析需要分单旋双旋讨论，这里不赘述，给两张图：

:::figure[单旋时需要更新的信息]
![Splay 单旋的信息更新示意图](https://z3.ax1x.com/2021/11/03/IEk0Zq.png)

:::

:::figure[双旋时需要更新的信息]
![Splay 双旋的信息更新示意图](https://z3.ax1x.com/2021/11/03/IEkBd0.png)

:::

### 你需要 pushdown 吗？

不难发现，需要 pushdown 的节点只是 $x$ 到根的路径节点。

可以想到，提前 pushdown 会省下不少事情。

```cpp
inline void rotate(pNode i)
{
    pNode f=i->fa,gf=f->fa;
    if(islc(i)) f->lc=i->rc,i->rc=f,f->lc&&(f->lc->fa=f);
    else f->rc=i->lc,i->lc=f,f->rc&&(f->rc->fa=f);
    if(gf) (islc(f)?gf->lc:gf->rc)=i;
    f->fa=i,i->fa=gf,pushup(f);
}
inline void pushall(pNode x)
{
    if(!x) return;
    pushall(x->fa);
    pushdown(x);
}
inline void splay(pNode x,pNode goal=nullptr)
{
    pushall(x);
    for(pNode f;(f=x->fa)!=goal;rotate(x))
        if(f->fa!=goal)
            rotate(islc(f)==islc(x)?f:x);
    pushup(x),goal||(rt=x);
}
```

这也是我们在写 LCT 时常干的事情。

当然，你可以用数组模拟栈来代替递归，会快一点点。

### 你需要 pushall 吗？

这么问就有些离谱了，但你还是先别急。

$\operatorname{SPLAY}$ 操作用处是均摊掉在**从根**开始搜到 $x$ 所用的时间。

大部分时候，你在搜索的过程中就会 pushdown 了。

于是 pushall 也被省略了！现在你的 Splay 中没有任何一点点没用的 pushdown/pushup。

## $\text{Leafy-Splay}$ 简介。

不一定有比较广泛的应用，但是有点意思。

:::definition[Leafy-Splay]
顾名思义，这个玩意儿是 $\text{Splay}$，但是不完全是，它还是 leafy 的，也就是说，其键值信息全部储存在叶子节点上。为了保持树结构，还需要 $n-1$ 个辅助节点。

:::

这样的好处有个显然的地方：信息合并的时候不用管中间节点的信息，因为中间节点是空的，只是用来占位。就像线段树一样。

一个广为人知的 leafy 平衡树是 $\text{WBLT}$，在这里不讲述。

### 插入操作

考虑把 $\text{Splay}$ 扩展为 leafy 的。其实并不难，在插入值 $x$ 的时候找到 $x$ 的前驱节点 $y$（如果不存在就找后继），这一定是一个叶子。我们把这个叶子的位置用一个辅助节点替代，然后辅助节点的两个儿子挂 $x,y$。最后，对新建的辅助节点执行 $\operatorname{SPLAY}$ 操作。

先说明这样的正确性：不难发现 $\operatorname{SPLAY}(x)$ 不会影响 $x$ 的子树内部结构，只会把子树挂的位置进行修改。也就是说，$\operatorname{SPLAY}$ 一个辅助节点并不会破坏 leafy 的结构。

至于时间复杂度，可以直接把树当做摘除了所有叶子节点来进行分析，所以还是 $O(\log n)$ 的（因为是摘掉了叶子，不用乘上那个 leafy tree 的节点常数，甚至小一点，因为辅助节点个数是 $n-1$）。

测试里 $\text{Leafy-Splay}$ 的 pushup 调用次数多一些，可能是那里 $\text{Splay}$ 的代码有重复节点计数导致的。

### 删除操作

先找到要删除的叶子节点，该节点的父亲（如果存在的话，不存在是平凡情况）一定有两个儿子。直接用未删除的儿子替换父亲的位置，然后进行 $\text{SPLAY}$ 操作。

非常简单。这也是 $\text{Leafy-Splay}$ 相较于传统 $\text{Splay}$ 的最大优势之一。传统 $\text{Splay}$ 的删除需要现把自己 $\operatorname{SPLAY}$ 到根，再找到前驱并 $\operatorname{SPLAY}$ 到根，然后接上子树，使用 $\operatorname{SPLAY}$ 的次数比 $\text{Leafy-Splay}$ 要多一次。

从测试里可以看到在有删除操作的情况下，$\text{Leafy-Splay}$ 优势明显。

### 合并操作

这里指的是无交合并，即保证 $\max(T_1) < \min(T_2)$。直接新建一个辅助节点把两棵树连起来即可，$O(1)$，不会破坏势能分析过程。这是另一个最大优势。

$\text{Splay}$ 启发式合并的单 $\log$ 复杂度分析放到这里应该也是正确的。

### 区间提取

区间提取稍微麻烦一些。

提取区间 $[l,r]$ 时需要找到 $l$ 的前驱以及 $r$ 的后继，并按照传统 $\text{Splay}$ 的提取方式进行操作就可以了。但是这里找的前驱和后继不能是叶子，只能是辅助节点。可以发现如果存在叶子的前驱/后继，那么也一定可以找到一个非叶子的前驱/后继。至于找不到前驱/后继的情况，可以通过添加哨兵节点（$-\infty$ 和 $+\infty$）避免。

注意这里不能一直递归到叶子，因为你 $\operatorname{SPLAY}$ 的节点不一定是叶子的父亲节点。可能需要维护区间内 $\min,\max$ 来及时终止递归。当然如果你愿意多 $\operatorname{SPLAY}$ 几次保证复杂度也是可以的。

顺带一提，这个找前驱的复杂度问题在传统 $\text{Splay}$ 的区间提取也是会出现的，但是很多人都没有留意。
