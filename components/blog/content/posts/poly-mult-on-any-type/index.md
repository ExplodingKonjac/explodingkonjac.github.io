---
title: 任意类型多项式乘法
description: 借助分圆多项式与扩域思想介绍 Cantor 算法，通过规避单位根与除法，在一般代数结构上实现多项式乘法。
pubDate: 2023-12-15
tags: [algorithms, polynomials, abstract-algebra, FFT]
draft: false
---

## 前言

:::definition[本文讨论的代数结构]
所谓“任意类型”，事实上指的是一种代数结构 $\mathcal{A}=(D,+,\cdot)$，满足：

- $+:D\times D\to D$，且 $(D,+)$ 构成阿贝尔群。
- $\cdot:D\times D\to D$。
- $(u+v)\cdot (x+y)=u\cdot x+u\cdot y+v\cdot x+v\cdot y$。

即，元素集合 $D$ 上定义了加法和乘法，加法满足交换律，乘法**不需要**满足结合律，满足分配律。也就是说，$\mathcal{A}$ 是不需要满足乘法结合律的环。

:::

于是，我们有一种算法，可以计算 $\mathcal{A}[x]$ 上的乘法。

在实际应用中，$\mathcal{A}$ 可以是几乎任何你能想到的东西：模 $998244353$，模 $19260817$，模 $2^{64}$，也可以是矩阵甚至是四元数，或者你自己随便定义的东西。

## 前置知识

### 定义与记号

我们会用到抽象代数中的一些概念，但是我们**不需要**知道严谨的定义，只需要一个相对感性的理解即可。

- **环（Ring）**是由元素集合、加法运算、乘法运算组成的三元组 $(D,+,\cdot)$，加法满足交换律，乘法满足分配律，加法和乘法满足结合律。事实上，在本文探讨的范围中，乘法结合律并不重要，所以乘法不满足结合律我们也将其视作环。
- 给定环 $\mathcal{A}$，那么 $\mathcal{A}[x]$ 指系数是 $\mathcal{A}$ 中元素的关于 $x$ 的多项式构成的环。
- 给定环 $\mathcal{A}$ 以及 $d\in\mathcal{A}$，那么 $\mathcal{A}/d$ 指 $\mathcal{A}$ 中元素在“模 $d$”意义下运算构成的环。你不需要了解这里“模”的严谨定义，因为在本文中只会涉及多项式的取模，这是大家熟知的。
- 对于 $n\in\mathbb{N},\ x\in\mathcal{A}$，我们记 $nx$ 为 $n$ 个 $x$ 相加。

### 单位根

因为抽象的概念难以描述，所以我们将在复数域上讨论单位根。

:::definition[单位根与本原单位根]
若 $\omega\in\mathbb{C}$ 满足 $\omega^n=1$，那么称其为 **$n$ 次单位根**。

若对于 $\forall\ 1\le k<n:\omega^n\neq 1$，那么称 $\omega$ 为一个 **$n$ 次本原单位根（Primitive Root）**，或称**原根**。我们任取一个本原单位根，记作 $\omega_n$。那么任何一个单位根都是 $\omega_n$ 的幂。

:::

若 $\omega =\omega_n^k$，那么可以发现，$\omega$ 是原根当且仅当 $\gcd(k,n)=1$。于是我们可以得到：**原根的数量是 $\varphi(n)$**。

### 分圆多项式

:::definition[分圆多项式]
定义 $n$ 阶分圆多项式 $\displaystyle\Phi_n(x)=\prod_{\gcd(k,n)=1}(x-\omega_n^k)$。即，根恰好为 $\varphi(n)$ 个原根的多项式。

:::

那么我们有结论：

:::proposition
$\Phi_n(x)$ 次数为 $\varphi(n)$，这是显然的。

:::

:::proposition
$\Phi_n(x)\mid (x^n-1)$。

:::

:::proof
因为 $(x^n-1)$ 的根是所有 $n$ 次单位根，所以 $\Phi_n(x)$ 的所有根都是 $(x^n-1)$ 的根，将多项式分解即得证。

:::

:::proposition
$\displaystyle x^n-1=\prod_{d|n}\Phi_d(x)$。

:::

:::proof
记 $P_d$ 为 $d$ 次原根组成的集合。记 $g=\gcd(n,k)$，那么，$\omega_n^k=\omega_{n/g}^{k/g},\ \gcd(n/g,k/g)=1$，于是每个 $n$ 次单位根恰好在 $P_{n/g}$ 中出现一次。于是结论可以得证。

:::

:::proposition
$\Phi_n(x)$ 是首一整系数多项式。

:::

:::proof
首一显然，整系数考虑使用数学归纳。

- 对于 $n=1$ 显然成立。

- 假设结论对于所有 $m<n$ 均成立。那么，令
  $$
  g(x)=\prod_{d|n,d<n}\Phi_d(x)
  $$
  则根据归纳假设知 $g(x)$ 是整系数的。于是根据带余除法，有唯一的 $q(x),r(x)$ 满足：
  $$
  x^n-1=g(x)q(x)+r(x)
  $$
  且 $q(x)$ 是整系数的。根据上一个结论，我们有 $x^n-1=\Phi_n(x)g(x)$，所以：
  $$
  r(x)=(\Phi_n(x)-q(x))g(x)
  $$
  根据带余除法性质，$\deg r(x)<\deg q(x)$，所以 $\Phi_n(x)-q(x)=0$。所以 $\Phi_n(x)$ 是整系数的。

于是结论得证。

:::

:::proposition
$\Phi_n(x)$ 是不可约的，证略。

:::

:::proposition
对于 $n$ 次原根 $\omega_n$，关于 $\omega_n$ 的多项式的运算可以对 $\Phi_n(\omega_n)$ 取模。

:::

:::proof
因为 $\Phi_n(\omega_n)=0$，所以取模不会影响多项式的实际值。

该结论的一个引申结论是，$\omega_n^k$ 可以被唯一地被 $\omega_n^0,\omega_n^1,\dots,\omega_n^{\varphi(n)-1}$ 线性表示，并且系数为整数。

:::

## Cantor's Algorithm

要进行多项式乘法，我们尝试使用 DFT。那么我们主要面对的问题有两个：

1. 不存在单位根。
2. IDFT 需要进行除法（即由 $nx,n$ 推出 $x$），我们不一定能够做除法。

接下来我们尝试逐个解决这两个问题。

### 规避单位根

我们采用**扩域**的思想，引入虚单位根 $\omega_n$ 并且带着它做运算。但是这样做一次乘法复杂度就会达到 $O(n^2)$，肯定是无法接受的。所以我们有了下面的算法。

#### 递归计算卷积

假设我们要求 $A(x)\cdot B(x)$，那么我们选取最小的 $m=s^r$ 满足 $\varphi(m)>\deg A+\deg B$。

那么我们可以将问题转化为求 $A(x)\cdot B(x)\bmod \Phi_m(x)$，也就是求 $A(\omega_m)\cdot B(\omega_m)$。因为 $\varphi(m)>\deg A+\deg B$，所以结果的指数不会溢出。又因为 $\omega_m^k$ 能被 $\omega_m^0,\omega_m^1,\dots,\omega_m^{\varphi(m)-1}$ 线性表示，所以得到的结果唯一（如果对 $x^m-1$ 取模，就可能得到不同的实际相等的结果）。那么最终 $\omega_m^k$ 的系数就是 $x^k$ 的系数。

记 $\mathcal{I}_m=\mathcal{A}[\omega_m]/\Phi_m(\omega_m)$，然后写下我们的算法形式：

:::note[递归子问题]
给定 $A(\omega_m),B(\omega_m),m$，在 $\mathcal{I}_m$ 上计算 $A(\omega_m)\cdot B(\omega_m)$。

:::

令 $p=s^u,q=s^v$ 满足 $u+v=r,\ v+1\le u\le v+2$，那么我们可以将多项式重写：

$$
\begin{aligned}
	A(x)&=\sum_{j=0}^{q-1}\left(\sum_{i=0}^{p-1}a_{iq+j}x^{iq}\right)x^j\\
	&=\sum_{j=0}^{q-1}\left(\sum_{i=0}^{p-1}a_{iq+j}\omega_m^{iq}\right)x^j\\
	&=\sum_{j=0}^{q-1}\left(\sum_{i=0}^{p-1}a_{iq+j}\omega_p^{i}\right)x^j\\
\end{aligned}
$$

那么，$x_j$ 的每一项系数都是 $\mathcal{I}_p$ 中的元素，于是我们的问题转化成了，求 $\mathcal{I}_p[x]$ 上的乘法。

我们可以做 $\mathcal{I}_p[x]$ 上长度为 $sq$ 的 DFT 来求出这个结果，这个 DFT 具体怎么在下一段说。我们做完 DFT 后，需要将两个数组对应位置相乘，每个位置都是 $\mathcal{I}_p$ 中元素。这个问题符合我们的算法形式，所以可以直接递归求解。求出结果后带入 $x\gets \omega_m$ 即可得到答案。

当 $m$ 足够小的时候可以进行暴力卷积，可以认为是进行 $O(1)$ 次乘法。

#### 做 $\mathcal{I}_p$ 上的 DFT

在这里，我们假设我们可以进行除法。

回忆一下 DFT 的过程，以 $s=2$ 为例（其它 $s$ 类似）：

$$
F(\omega_n^k)=F_0(\omega_{n/2}^k)+\omega_n^kF_1(\omega_{n/2}^k)\\
F(\omega_n^{k+n/2})=F_0(\omega_{n/2}^k)-\omega_n^kF_1(\omega_{n/2}^k)
$$

因为 $n\le q<p/s$，所以我们可以进行转化：$\omega_n=\omega_{p}^{p/n}$。我们需要进行的操作是 $\mathcal{I}_p$ 上的加法以及乘 $\omega_p^k$，其中后者可以看做是循环移位。于是两个操作都可以 $O(p)$ 完成。那么一次 DFT 需要进行 $O(srpq)$ 次加法。

当 $s>2$ 的时候，蝴蝶变换会变得十分鬼畜，可以采用转置 FFT 的技巧省略蝴蝶变换。

#### 时间复杂度

我们不妨把 $s$ 看做常数，那么一层中 DFT 的复杂度是 $O(m\log m)$。

因为 $p,q$ 都是 $O(\sqrt m)$ 的，所以我们可以得到：

- 加法次数：$T(m)=O(\sqrt m) T(\sqrt m)+O(m\log m)=O(m\log m\log\log m)$。
- 乘法次数：$T(m)=O(\sqrt m) T(\sqrt m)+O(1)=O(n)$。

### 规避除法

假设我们要做长度为 $n=s^r$ 的 DFT，且有 $ns$ 次单位根 $\omega_{ns}$。

设我们要求 $C(x)=A(x)\cdot B(x)$，且 $A,B,C$ 系数分别为 $a_i,b_i,c_i$。记 $D=\operatorname{DFT}(a)\cdot \operatorname{DFT}(b)$，设 $d_i$ 为对 $D$ 做 IDFT 后未除以 $n$ 的结果，那么：

$$
\begin{align}
	d_i=n(c_i+c_{i+n})\tag{1}
\end{align}
$$

令 $\hat a_i=a_i\omega_{ns}^i,\ \hat b_i=b_i\omega_{ns}^i$。记 $E=\operatorname{DFT}(\hat a)\cdot \operatorname{DFT}(\hat b)$，然后设 $e_i\omega_{ns}^i$ 为对 $E$ 做 IDFT 后未除以 $n$ 的结果，那么：

$$
\begin{align}
    e_h\omega_{ns}^h&=n(c_h\omega_{ns}^h+c_{h+n}\omega_{ns}^{h+n}) \\
    e_h&=n(c_h+c_{h+n}\omega_s)\tag{2}
\end{align}
$$

将 $(1),(2)$ 联立可以得到：

$$
\begin{cases}
	n(1-\omega_s)c_h=e_h-d_h\omega_s\\
	n(1-\omega_s)c_{n+h}=d_h-e_h
\end{cases}
$$

设 $\tau_n=\Phi_n(1)$，那么 $\tau_n$ 是一个整数，且当 $n$ 为素数 $p$ 的幂时 $\tau_n=p$，否则 $\tau_n=1$。则：

$$
\frac{\tau_s}{1-\omega_s}=\prod_{2\le i<s,\gcd(i,s)=1}(1-\omega_s^i)
$$

将上式乘上这个等式，得到：

$$
\begin{cases}
	\displaystyle n\tau_sc_i=(e_i-d_i\omega_s)\prod_{2\leq i<s,\gcd(i,s)=1}(1-\omega_s^i)\\
	\displaystyle n\tau_sc_{i+n}=(d_i-e_i)\prod_{2\leq i<s,\gcd(i,s)=1}(1-\omega_s^i)
\end{cases}
$$

系数都是好求的，因此我们把式子简记为：

$$
\begin{cases}
M_1 c_i=N_1 \\
M_2 c_{i+n}=N_2 \\
\end{cases}
$$

求 $c_i$ 和 $c_{i+n}$ 过程类似，以前者为例。选择两个不同的互素的 $s$ 进行上面的操作，我们可以得到 $M_{1,1}c_i$ 和 $M_{1,2} c_i$ 的值。而 $M_{1,1}$ 和 $M_{1,2}$ 互素，所以可以用 exgcd 求解 $M_{1,1}x+M_{1,2}y=1$。然后计算 $x\cdot M_{1,1}c_i+y\cdot M_{1,2}c_i$ 的值就是 $c_i$。

这里使用的单位根可以直接用之前造出来的单位根，也就是在 $\mathcal{I}_p$ 上运算。

### 实现细节

- 实际实现不需要一直对 $\Phi_m(x)$ 取模，可以在递归过程中对 $x^m-1$ 取模（也就是循环卷积），最后再对 $\Phi_m(x)$ 取模。
- 在实际应用中，如果 $\mathcal{A}$ 是模域 $\mathbb{F}_p$，那么可以不用规避除法的步骤。对于 $2\mid p$，可以选择 $s=3$；对于 $2\nmid p$，可以选择 $s=2$。这样 $s$ 就存在逆元，可以直接除。
- 对于 $p\in \mathbb{P}$，有 $\displaystyle\Phi_{p^k}(x)=\sum_{i=0}^{p-1}x^{ip^{k-1}}$。

### 参考资料

#### 参考文献

- [1] quasisphere, Fast convolution for 64-bit integers. <https://codeforces.com/blog/entry/45298>.

- [2] whx1003，如何在任意代数结构上做多项式乘法。<https://www.cnblogs.com/whx1003/p/16214952.html>。

- [3] 彭雨翔，Introduction to Polynomials。

#### 参考代码

- [【模板】多项式乘法（FFT）](https://www.luogu.com.cn/problem/P3803)，[代码](https://paste.ubuntu.com/p/QxNn76W2yB/)，[提交记录](https://www.luogu.com.cn/record/139703887)。

  因为不想写 3-radix FFT 所以没有写任意模数多项式乘法。

- [Transforming Sequence](https://codeforces.com/contest/623/problem/E)，[代码](https://paste.ubuntu.com/p/YBhFSfC4dv/)，[提交记录](https://codeforces.com/contest/623/submission/237336639)。

  时限很松，可以轻松通过。
