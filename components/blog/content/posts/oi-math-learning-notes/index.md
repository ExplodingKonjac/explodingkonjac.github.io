---
title: 数学杂项学习笔记
description: 整理算法竞赛中的数论与线性代数知识，包括整除分块、积性函数、莫比乌斯反演、筛法、欧几里得算法、二次剩余与矩阵。
pubDate: 2022-02-24
tags: [mathematics, number-theory, linear-algebra, competitive-programming]
draft: false
---

这个 nt 在一次次模拟赛中~~终于~~发现了一个显然的事实：他对数学一窍不通。

为了防止学完就忘，于是就有了这个。

这里面的知识点是乱序的，因此会存在其间相互有联系。

## Part 1：数论

### 整除分块

用途，求形似于 $\displaystyle\sum_{i=1}^n f(i)g\left(\left\lfloor\tfrac{n}{i}\right \rfloor\right)$ 的和式，要求 $g(x)$、$\displaystyle\sum_{i=l}^r f(i)$ 可以快速计算。

数论分块的主要操作是将所有 $\left\lfloor\dfrac{n}{i}\right\rfloor$ 相同的求和项打包计算，容易发现，这些相同的 $\left\lfloor\dfrac{n}{i}\right\rfloor$ 对应的 $i$ 是一段连续的区间，一般可以通过预处理来求出此时 $f$ 的和。

---

:::lemma[引理 1]

$$
\forall n\in\mathbb{N^*},\ \left|\left\{\left\lfloor\dfrac{n}{d}\right\rfloor\ \Big|\ d\in\mathbb{N^*},\ d\le n\right\}\right|\le 2\sqrt n
$$

:::

:::proof

若 $d\le \sqrt n$，显然 $\left\lfloor\dfrac{n}{d}\right\rfloor$ 只可能有 $\sqrt n$ 种取值；

否则，有 $\left\lfloor\dfrac{n}{i}\right\rfloor\le \sqrt n$，也只可能有 $\sqrt n$ 种取值；

综上所述，引理得证。

:::

---

#### 整除分块结论

根据上面的引理，使用整除分块的复杂度是 $O(\sqrt n)$ 的。那么对于一个左端点 $l$，它对应的右端点 $r$ 是什么呢？

首先根据定义，有 $\left\lfloor\dfrac{n}{l}\right\rfloor=\left\lfloor\dfrac{n}{r}\right\rfloor$。我们又知道，这个函数是关于 $r$ 单调不增的，所以我们就是要求 $\max\left\{r\ \Big|\ \left\lfloor\dfrac{n}{r}\right\rfloor\ge\left\lfloor\dfrac{n}{l}\right\rfloor\right\}$

于是我们转化一下，得到 $\dfrac{n}{r}\ge\left\lfloor\dfrac{n}{l}\right\rfloor$，也就是说 $r\le\left\lfloor\dfrac{n}{\left\lfloor\frac{n}{l}\right\rfloor}\right\rfloor$

代码实现时直接一个个跳区间即可。

---

#### 多元整除分块

即式子是 $\displaystyle\sum_i f(i)\prod_{j=1}^k g_j\left(\left\lfloor\tfrac{n_j}{i}\right\rfloor\right)$ 的形式。在每次跳右端点的时候选择 $r=\min\left(\left\lfloor\dfrac{n}{\left\lfloor\frac{n}{l}\right\rfloor}\right\rfloor\right)$ 就可以了。容易证明 $k$ 元的整除分块复杂度是 $O(k\sqrt n)$ 的。

---

#### 例 1

求 $\displaystyle\sum_{i=1}^n \left\lfloor\dfrac{n}{i}\right\rfloor$，$n\le 10^{14}$。

```cpp
for(int l=1,r=0;l<=n;l=r+1)
	r=n/(n/l),ans+=1ll*(r-l+1)*(n/l);
```

---

#### 例 2

求 $\displaystyle\sum_{x=1}^a\sum_{y=1}^b[\gcd(x,y)=d]$，多组询问，$T\le 5\times 10^4,\ d,a,b\le 5\times 10^4$。

使用莫比乌斯反演后，式子变为 $\displaystyle\sum_d\mu(d)\sum_{x=1}^{\lfloor a/d\rfloor}\sum_{y=1}^{\lfloor b/d\rfloor}1$，整除分块即可。

```cpp
lim=min(n/=d,m/=d),ans=0;
for(int l=1,r=0;l<=lim;l=r+1)
	r=min(n/(n/l),m/(m/l)),ans+=1ll*(sum[r]-sum[l-1])*(n/l)*(m/l);
```

### 积性函数与线性筛

#### 积性函数

:::definition[积性函数]
**对于一个数论函数 $f(n)$，如果其满足 $\forall a\perp b,\ f(ab)=f(a)f(b)$，则称其为积性函数，特别地，如果对于 $\forall a,b\in\mathbb{N^\*}, f(ab)=f(a)f(b)$，则称其为完全积性函数**。

:::

设 $f(n),g(n)$ 为两个积性函数，则以下函数都是积性函数：

$$
\begin{aligned}
	h(n)&=f(n^p)\\
	h(n)&=f(n)^p\\
	h(n)&=f(n)g(n)\\
	h(n)&=\sum_{d|n}f(n)g\left(\tfrac{n}{d}\right)
\end{aligned}
$$

以下是一些常见的积性函数：

- 单位函数 $\varepsilon(n)=[n=1]$；
- 幂函数 $\operatorname{Id}_k(n)=n^k$；
- 常数函数 $1(n)=1$（完全积性）；
- 除数函数 $\sigma_k(n)=\sum_{d|n}d^k$；
- 欧拉函数 $\varphi(n)=\sum_{i=1}^n[i\perp n]$；
- 莫比乌斯函数 $\mu(n)$。

---

#### 线性筛

线性筛可以在 $O(n)$ 时间内筛出 $[1,n]$ 中所有质数。线性筛也可以求解绝大部分积性函数，能够在筛质数同时求出对于 $i\in[1,n]$ 的所有 $f(i)$。以下是朴素线性筛的代码：

```cpp
for(int i=2;i<=N;i++)
{
	if(!vis[i]) prm.push_back(i);
	for(auto &j: prm)
	{
		if(i*j>N) break;
		vis[i*j]=true;
		if(i%j==0) break;
	}
}
```

在 `i%j==0` 处退出保证了每个数只会被一个质数筛一次，故复杂度是 $O(n)$ 的。这也使线性筛满足这些性质：**一个数被筛时的质数是其最小的质因子；一个数 $x$ 筛别的数时 $p|x$ 时的 $p$ 是 $x$ 的最小质因子**。

线性筛求解积性函数主要从以下几个方面考虑：

1. $x\in\mathbb{P}$，通常是平凡的；
2. $p\nmid x$，利用积性函数的性质，$f(px)\gets f(x)f(p)$；
3. $p\mid x$，需要重点考虑的地方。

解决第三种情况的基本套路是：先考虑 $f(p^k)$，然后把 $x$ 拆成 $a\cdot p^k$，使得 $a\perp p$，然后，构建 $f(a\cdot p^{k+1})$ 与 $f(a\cdot p^k)$ 的关系，然后消去 $a$，最后得到容易处理的 $f(px)$ 和 $f(x)$ 的关系 。

下面通过两个例子来说明这种方法：

---

#### 例 1

用线性筛求解欧拉函数 $\displaystyle\varphi(n)=\sum_{i=1}^n[i\perp n]$。

设 $p\in\mathbb{P}$，则有 $\varphi(p^k)=p^k-p^{k-1}$。假设我们现在要由 $\varphi(n)$ 求出 $\varphi(np),\ (p\mid n)$，先令 $n=a\cdot p^k,\ (a\perp p)$。

由欧拉函数积性知

$$
\begin{cases}
	\varphi(a\cdot p^k)=\varphi(a)(p^k-p^{k-1})\\
	\varphi(a\cdot p^{k+1})=\varphi(a)(p^{k+1}-p^k)
\end{cases}
$$

上下两式相除得

$$
\begin{aligned}
\frac{\varphi(a\cdot p^k)}{\varphi(a\cdot p^{k+1})}&=\frac{p^k-p^{k-1}}{p^{k+1}-p^k}\\
\frac{\varphi(n)}{\varphi(np)}&=\frac{1}{p}\\
\varphi(np)&=p\cdot\varphi(n)
\end{aligned}
$$

于是可以求解。

```cpp
for(int i=2;i<=N;i++)
{
	if(!vis[i])	prm.push_back(i),phi[i]=i-1;
	for(auto &j: prm)
	{
		if(i*j>N) break;
		vis[i*j]=true;
		if(i%j==0) { phi[i*j]=phi[i]*j;break; }
		phi[i*j]=phi[i]*(j-1);
	}
}
```

---

#### 例 2

用线性筛求解除数函数 $\displaystyle\sigma_m(n)=\sum_{d|n}d^m$

考虑 $p\in\mathbb{P}$，有 $\displaystyle\sigma_m(p^k)=\sum_{i=0}^n p^{im}=\sigma_m(p^{k-1})+p^{km}$

按照老套路，令 $n=a\cdot p^k$，使得 $a\perp p$。则有；

$$

\begin{cases}
	\sigma_m(a\cdot p^{k+1})=\sigma_m(a)(\sigma_m(p^k)+p^{km})\\
	\sigma_m(a\cdot p^k)=\sigma_m(a)\sigma_m(p^k)
\end{cases}
$$

先上式减去下式得：

$$

\sigma_m(a\cdot p^{k+1})-\sigma_m(a\cdot p^k)=\sigma_m(a)\cdot p^{km}
$$

看上去没有什么东西，但是我们知道 $k\ge 1$，所以可以以 $k-1$ 代换 $k$，并和上式联立得：

$$

\begin{cases}
	\sigma_m(a\cdot p^{k+1})-\sigma_m(a\cdot p^k)=\sigma_m(a)\cdot p^{km}\\
	\sigma_m(a\cdot p^k)-\sigma_m(a\cdot p^{k-1})=\sigma_m(a)\cdot p^{km-m}
\end{cases}
$$

这个形式就很好了，两式相除消去 $\sigma_m(a)$ 得到：

$$

\begin{aligned}
	\frac{\sigma_m(a\cdot p^{k+1})-\sigma_m(a\cdot p^k)}{\sigma_m(a\cdot p^k)-\sigma_m(a\cdot p^{k-1})}&=\frac{p^{km}}{p^{km-m}}\\
	\frac{\sigma_m(np)-\sigma_m(n)}{\sigma_m(n)-\sigma_m(n/p)}&=p^m\\
	\sigma_m(np)-\sigma_m(n)&=p^m\left(\sigma_m(n)-\sigma_m\left(\tfrac{n}{p}\right)\right)\\
	\sigma_m(np)&=\sigma_m(n)+p^m\left(\sigma_m(n)-\sigma_m\left(\tfrac{n}{p}\right)\right)
\end{aligned}
$$

然后就可以线性筛。 因为要求 $p^m$，所以时间复杂度是 $O(\frac{n\log m}{\ln n})$ 的。

当 $m=0$ 时，该函数就是常见的因数个数函数 $\operatorname{d}(n)$，有 $\operatorname{d}(np)=2\operatorname{d}(n)-\operatorname{d}\left(\frac{n}{p}\right)$ 。

### 莫比乌斯反演

#### 莫比乌斯函数

莫比乌斯函数 $\mu(n)$ 定义：

$$
\mu(x)=
\begin{cases}
1&,n=1\\
0&,n\text{ 含有平方因子}\\
(-1)^k&,k\text{ 为 }n\text{ 本质不同质因子个数}
\end{cases}
$$

显然，$\mu(n)$ 是积性函数，可以使用线性筛求解。

```cpp
for(int i=2;i<=N;i++)
{
	if(vis[i]) prm.push_back(i),mu[i]=-1;
	for(auto &j: prm)
	{
		if(i*j>N) break;
		vis[i*j]=true;
		if(i%j==0) { mu[i*j]=0;break; }
		mu[i*j]=-mu[i];
	}
}
```

---

:::lemma[引理 1]

$$
\sum_{d|n}\mu(d)=[n=1]
$$

:::

:::proof

令 $\displaystyle n=\prod_{i=1}^k p_i^{\alpha_i},\ n'=\prod_{i=1}^k p_i,\ (p_i\in\mathbb{P})$

因为当 $d$ 的某个质因数次数超过 $1$ 时，$\mu(d)=0$，所以我们有 $\displaystyle\sum_{d|n}\mu(d)=\sum_{d|n'}\mu(d)$

先考虑 $k\neq 0$ 的情况。将循环条件改为枚举 $d$ 含有的质因数个数得：

$$
\sum_{d|n'}\mu(d)=\sum_{i=1}^k{k\choose i}(-1)^i=(1+(-1))^k=0
$$

而当 $k=0$ 时，容易得到原式为 $1$。

综上，当且仅当 $n=1$ 时，$\displaystyle\sum_{d|n}\mu(d)=1$，其它情况都是 $0$，引理得证。

我们经常会使用这个结论的一个特例：$\displaystyle[\gcd(a,b)=1]=\sum_{d|\gcd(a,b)}\mu(d)$

:::

---

#### 狄利克雷卷积

:::definition[狄利克雷卷积]
对于数论函数 $f(n),\ g(n)$，定义其狄利克雷卷积为 $\displaystyle(f*g)(n)=\sum_{d|n}f(d)g\left(\frac{n}{d}\right)$。

:::

**狄利克雷卷积满足交换律、结合律、分配律，且有 $\varepsilon\*f=f$，即单位函数 $\varepsilon(n)$ 是狄利克雷卷积的单位元**。

同时狄利克雷卷积还有一个性质，就是**两个积性函数的狄利克雷卷积仍然是积性函数**。

使用狄利克雷卷积可以得到一些数论函数的定义/性质，如：

- $\sigma_k=1*\operatorname{Id}_k$；
- $\operatorname{Id}=1*\varphi$；
- $\operatorname{d}=1*1$；
- $\varepsilon=1*\mu$（就是上面引理的另一种形式）。

对于数论函数 $f(n)$，如果有数论函数 $g(n)$ 满足 $f*g=\varepsilon$，我们称 $g$ 为 $f$ 的狄利克雷逆，记作 $f^{-1}$。

狄利克雷逆的定义如下：

$$
f^{-1}(n)=
\begin{cases}
	\displaystyle\frac{1}{f(1)}&,n=1\\
	\displaystyle-\frac{1}{f(1)}\sum_{d|n,d\neq 1}f(d)f^{-1}\left(\tfrac{n}{d}\right)&,\text{otherwise}
\end{cases}
$$

狄利克雷逆满足，**对于所有积性函数都存在狄利克雷逆，且其逆也是积性函数。**

---

#### 莫比乌斯反演

$$
f(n)=\sum_{d|n} g(d)\Rightarrow g(n)=\sum_{d|n}\mu(d)f\left(\tfrac{n}{d}\right)
$$

证明如下：

$$
\begin{aligned}
	\sum_{d|n}\mu(d)f\left(\tfrac{n}{d}\right)&=\sum_{d|n}\mu(d)\sum_{k|\frac{n}{d}}g(k)\\
    &=\sum_{k|n}g(k)\sum_{d|\frac{n}{k}}\mu(d)\\
    &=\sum_{k|n}\left[\frac{n}{k}=1\right]g(k)=g(n)
\end{aligned}
$$

或者利用狄利克雷卷积这样证明：

$$
\begin{aligned}
	&\text{原式等价于 }&f=g*1\ (1)\Rightarrow g=\mu *f\ (2)\\
	&\text{由 Lemma 1 知 }&\mu*1=\varepsilon\\
	&\text{式 (1) 两边卷 }\mu\text{ 得}&f*\mu=g*1*\mu=g*(1*\mu)=g
\end{aligned}
$$

---

#### 例 1

求 $\displaystyle\sum_{x=1}^n\sum_{y=1}^m[\gcd(x,y)\in\mathbb{P}]$，多组询问，$T\le 10^4,\ n,m\le10^7$。

令 $p\in\mathbb{P}$，将原式变形：

$$
\begin{aligned}
	\text{原式}&=\sum_p\sum_{x=1}^{\lfloor n/p\rfloor}\sum_{y=1}^{\lfloor m/p\rfloor}[\gcd(x,y)=1]\\
	&=\sum_p\sum_{x=1}^{\lfloor n/p\rfloor}\sum_{y=1}^{\lfloor m/p\rfloor}\sum_{d|\gcd(x,y)}\mu(d)\\
	&=\sum_p\sum_d\mu(d)\cdot\left\lfloor\frac{\lfloor n/p\rfloor}{d}\right\rfloor\left\lfloor\frac{\lfloor m/p\rfloor}{d}\right\rfloor\\
	&=\sum_{p,d}\mu(d)\cdot\left\lfloor\frac{n}{pd}\right\rfloor\left\lfloor\frac{m}{pd}\right\rfloor
\end{aligned}
$$

对于 $pd$ 整除分块。因为质数个数是 $O\left(\dfrac{n}{\ln n}\right)$ 的，而枚举倍数又是 $O(\ln n)$ 的，所以 $pd$ 个数是 $O(n)$ 的。预处理一下 $\displaystyle f(n)=\sum_{p\in\mathbb{P},p|n} \mu\left(\frac{n}{p}\right)$ 的前缀和即可。

---

#### 例 2

多次询问求 $\displaystyle\sum_{i=1}^n \operatorname{lcm}(i,n)$，$T\le 3\times 10^5,\ n\le 10^6$。

~~好像和莫反没什么关系但是确实是个好题~~先把 $\operatorname{lcm}$ 换成 $\gcd$：

$$
\displaystyle\sum_{i=1}^n\operatorname{lcm}(n,i)=\sum_{i=1}^n\frac{ni}{\gcd(n,i)}=n\sum_{i=1}^n\frac{i}{\gcd(n,i)}
$$

接下来进行一些炫目魔术，把整个和式复制一遍，然后反转加在一起：

$$
\begin{aligned}
	\text{原式}&=\frac{1}{2}n\left(\sum_{i=1}^{n-1}\frac{i}{\gcd(n,i)}+\sum_{i=1}^{n-1}\frac{n-i}{\gcd(n,n-i)}\right)+n\\
	&=\frac{1}{2}n\left(\sum_{i=1}^{n-1}\frac{i}{\gcd(n,i)}+\sum_{i=1}^{n-1}\frac{n-i}{\gcd(i,n)}\right)+n\\
	&=\frac{1}{2}n\sum_{i=1}^{n}\frac{n}{\gcd(n,i)}+\frac{n}{2}\\
	&=\frac{1}{2}n\sum_{d|n}\frac{n}{d}\sum_i\left[\gcd\left(\frac{n}{d},i\right)=1\right]+\frac{n}{2}\\
	&=\frac{1}{2}n\sum_{d|n}\frac{n}{d}\varphi\left(\frac{n}{d}\right)+\frac{n}{2} \\
	&=\frac{1}{2}n\left(\sum_{d|n}\varphi(d)d+1\right)
\end{aligned}
$$

我们设 $f(n)=\displaystyle\sum_{d|n}\varphi(d)d$，重点就在于求出 $f(n)$，然后就可以 $O(1)$ 回答询问。

观察一下可以发现，$f(n)$ 是一个积性函数，这就意味着可以使用线性筛求解。线性筛过程中 $n\in\mathbb{P}$ 和 $p\nmid n$ 的情况很好处理，重点解决 $p\mid n$ 的情况。

设 $p\in\mathbb{P}$，则有 $\displaystyle f(p^k)=\sum_{i=1}^k \varphi(p^i)p^i=\sum_{i=1}^k p^{2i-1}(p-1)=f(p^{k-1})+p^{2k-1}(p-1)$

利用这个东西，我们可以对于一个 $n$，求出 $f(np)$，我们先令 $n=a\cdot p^k$ 且 $\gcd(a,p)=1$：

$$
\begin{cases}
f(np)=f(a)\cdot f(p^{k+1})\\
f(n)=f(a)\cdot f(p^k)
\end{cases}\Rightarrow
\begin{cases}
f(np)-f(n)=f(a)\cdot p^{2k+1}\cdot (p-1)\\
f(n)-f(n/p)=f(a)\cdot p^{2k-1}\cdot (p-1)
\end{cases}
$$

右边两式相除就得到 $f(np)=f(n)+\left(f(n)-f\left(\frac{n}{p}\right)\right)p^2$，可以线性筛。

### 杜教筛

杜教筛可以在低于线性的时间复杂度下求出某个积性函数 $f(n)$ 的前缀和 $\displaystyle S(n)=\sum_{i=1}^n f(i)$。其核心思想是构造一个 $S(n)$ 与 $S\left(\left\lfloor\dfrac{n}{i}\right\rfloor\right)$ 的关系式，以便使用整除分块。

---

:::lemma[引理 1]

$$
\sum_{i=1}^n (f*g)(i)=\sum_{i=1}^n g(i)S\left(\left\lfloor\frac{n}{i}\right\rfloor\right)
$$

:::

:::proof

$$
\begin{aligned}
	\text{LHS}&=\sum_{i=1}^n\sum_{d|i}f(d)g\left(\frac{n}{d}\right)\\
	&=\sum_{i=1}^n\sum_{j=1}^{\left\lfloor n/i\right\rfloor} g(i)f(j)\\
	&=\sum_{i=1}^n g(i)\sum_{j=1}^{\left\lfloor n/i\right\rfloor}f(j)=\text{RHS}
\end{aligned}
$$

于是我们有 $\displaystyle g(1)S(n)=\sum_{i=1}^n (f*g)(i)-\sum_{i=2}^n g(i)S\left(\left\lfloor\frac{n}{i}\right\rfloor\right)$。杜教筛就是要构造一个合适的 $g$，使得该式左半边可以方便求出，而右半边可以用整除分块+递归处理。下面用几个例子进行说明。

:::

---

#### 例 1

求解 $\displaystyle\sum_{i=1}^n \mu(i),\ \sum_{i=1}^n\varphi(i),\ n\le 10^{12}$。

1. 我们知道 $\mu*1=\varepsilon$，所以我们有 $\displaystyle S(n)=\sum_{i=1}^n\varepsilon(i)-\sum_{i=2}^n S\left(\left\lfloor\frac{n}{i}\right\rfloor\right)=1-\sum_{i=2}^n S\left(\left\lfloor\frac{n}{i}\right\rfloor\right)$。整除分块再递归计算即可。
2. 我们知道 $\varphi*1=\operatorname{Id}$，所以我们有 $\displaystyle S(n)=\sum_{i=1}^n\operatorname{Id}(i)-\sum_{i=2}^n S\left(\left\lfloor\frac{n}{i}\right\rfloor\right)=\frac{n(n-1)}{2}-\sum_{i=2}^n S\left(\left\lfloor\frac{n}{i}\right\rfloor\right)$。整除分块再递归计算即可。

~~这两个解法的文本几乎完全是复制的~~

---

#### 例 2

求解 $\displaystyle\sum_{i=1}^n\sum_{j=1}^nij\gcd(i,j),\ n\le 10^{10}$。

$$
\begin{aligned}
	\text{原式}&=\sum_{d}d\sum_{i=1}^{\lfloor n/d\rfloor}\sum_{j=1}^{\lfloor n/d\rfloor}[\gcd(i,j)=1]id\cdot jd\\
	&=\sum_{d}d^3\sum_k\mu(k)\sum_{i=1}^{\lfloor n/dk\rfloor}\sum_{j=1}^{\lfloor n/dk\rfloor}ik\cdot jk\\
	&=\sum_{d,k}d^3k^2\mu(k)\left(\sum_{i=1}^{\lfloor n/dk\rfloor}i\right)^2
\end{aligned}
$$

令 $\displaystyle T=dk,\ F(n):=\sum_{i=1}^n i$，则有：

$$
\begin{aligned}
	\text{原式}&=\sum_T\left(T^2\sum_{d|T}d\cdot\mu\left(\frac{n}{d}\right)\right)F\left(\left\lfloor\frac{n}{T}\right\rfloor\right)^2\\
	&=\sum_T T^2\varphi(T)\cdot F\left(\left\lfloor\frac{n}{T}\right\rfloor\right)^2
\end{aligned}
$$

现在关键在于求出 $T^2\varphi(T)$ 的前缀和。因为 $n$ 的范围比较大，所以需要杜教筛。我们设这个函数是 $g(n)$，并给它卷上一个 $\operatorname{Id_2}$：

$$
\begin{aligned}
	(g*\operatorname{Id_2})(n)&=\sum_{d|n}d^2\varphi(d)\cdot\left(\frac{n}{d}\right)^2\\
	&=n^2\sum_{d|n}\varphi(d)=n^3
\end{aligned}
$$

形式很好，套上杜教筛的式子就有：

$$
S(n)=\sum_{i=1}^n i^3-\sum_{i=2}^n i^2 S\left(\left\lfloor\frac{n}{i}\right\rfloor\right)
$$

利用平方和公式以及立方和公式，就很好求了。

### Powerful Numbers 筛（PN 筛）

Powerful Numbers 是指所有质因子的次数都 $\ge 2$ 的正整数。

:::lemma[引理 1]

$\le n$ 的 Powerful Numbers 数量是 $O(\sqrt n)$ 的。

:::

:::proof

Powerful Numbers 可以写成 $a^2 b^3$ 的形式，于是可以枚举 $a$，计算满足条件的 $b$ 的数量。这样枚举得到的数量肯定不小于真实数量。

$$
\begin{aligned}
\sum_{a=1}^{\sqrt{n}} \left\lfloor\sqrt[3]{\frac{n}{a^2}}\right\rfloor&\approx\int_1^{\sqrt{n}} \sqrt[3]{\frac{n}{x^2}}\mathrm{d}x \\
&=\left.\left(3\sqrt[3]{nx}\right)\right|_1^{\sqrt{n}} \\
&=O(\sqrt{n})
\end{aligned}
$$

枚举 Powerful Numbers 可以直接 DFS。

:::

---

PN 筛可以求出一类积性函数 $f(n)$ 的前缀和，当满足：

$$
\begin{gathered}
    f(1)=1\\
    \exists\,g:g(1)=1,\ g(p)=f(p)\ (p\in\mathbb{P})
\end{gathered}
$$

且，$g(n)$ 是容易求前缀和的。

那么，设 $h:=f*g^{-1}$，则有 $\forall\,p\in\mathbb{P}:f(p)=h(p)g(1)+h(1)g(p)=h(p)+g(p)$。又因为 $g(p)=f(p)$，所以有 $h(p)=0$。

因为 $h(n)$ 也是积性函数，所以含有一次质因子的位置值均为 $0$，也就是说，$h(n)$ 只在 Powerful Numbers 处有值。

设 $\displaystyle S_f(n):=\sum_{i=1}^n f(n),\ S_g(n)=\sum_{i=1}^n g(n)$，由 $f=g*h$ 可得：

$$
\begin{aligned}
S_f(n)&=\sum_{i=1}^n\sum_{d|i}h(d)g\left(\frac{i}{d}\right) \\
&=\sum_{d=1}^n h(d)\sum_{id\le n}g(i) \\
&=\sum_{d=1}^n h(d)S_g\left(\left\lfloor\frac{n}{d}\right\rfloor\right)
\end{aligned}
$$

于是可以枚举 Powerful Numbers $d$ 直接计算即可。

计算 $h(d)$ 只需要计算 $h(p^c)\ (p\in\mathbb{P})$。计算 $h(p)$ 可以推导处简洁形式，也可以根据 $h$ 的定义求：

$$
f(p^c)=\sum_{i=0}^cg(p^i)h(p^{c-i})\  \Longrightarrow\ h(p^c)=f(p^c)-\sum_{i=1}^c g(p_i)h(p^{c-i})
$$

递推即可。

#### 例 1

求积性函数 $f(n)$ 的前缀和，$n\le 10^{13}$。$f(n)$ 定义为：

$$
f(n):=\prod(p_i+\alpha_i)^{\alpha_i}
$$

其中 $n$ 的质因数分解为 $\displaystyle n=\prod p_i^{\alpha_i}$。

发现 $f(p)=p+1=\sigma(p)$，于是设 $g(n)=\sigma(n)$，套 Powerful Numbers。

问题只剩下求 $\displaystyle \sum_{i=1}^n g(i)$。稍微变化一下即可得到 $\displaystyle \sum_{i=1}^n g(i)=\sum_{i=1}^n i\left\lfloor\frac{n}{i}\right\rfloor$，整除分块即可。

因为有一个整除分块，所以要把复杂度证一下：

$$
\begin{aligned}
    T(n)&=\sum_{a=1}^{\sqrt n}\sum_{b=1}^{\sqrt[3]{n/a^2}}\sqrt{\frac{n}{a^2 b^3}} \\
    &=\sum_{a=1}^{\sqrt n}\sqrt{\frac{n}{a^2}}\int_1^{\sqrt[3]{n/a^3}}\sqrt{\frac{1}{x^3}}\mathrm{d}x \\
    &=\sum_{a=1}^{\sqrt n}\sqrt{\frac{n}{a^2}}\cdot\left(2-2n^{-1/6}a^{-1/2}\right) \\
    &=2\int_1^{\sqrt n} \sqrt{\frac{n}{x^2}}\left(1-n^{-1/6}x^{-1/2}\right)\mathrm{d}x \\
    &=\left.2\left(2n^{1/3}x^{-1/2}+\sqrt{n}\log x\right)\right|_1^{\sqrt n} \\
    &=O(\sqrt{n}\log n)
\end{aligned}
$$

### 类欧几里得算法

#### 基础类欧

类欧几里得算法可以在 $O(\log n)$ 时间内求出 $\displaystyle f(n,a,b,c)=\sum_{i=0}^n\left\lfloor\frac{ai+b}{c}\right\rfloor$ 的单点值。

对于 $a\ge c$ 或 $b\ge c$，我们将 $a,b$ 对 $c$ 取模简化问题。

$$
\newcommand\lfl{\left\lfloor}
\newcommand\rfl{\right\rfloor}
\begin{aligned}
	f(n,a,b,c)&=\sum_{i=0}^n\lfl\frac{(c\lfl a/c\rfl+a\bmod c)i+(c\lfl b/c\rfl+b\bmod c)}{c}\rfl\\
	&=\sum_{i=0}^n\lfl\lfl\frac{a}{c}\rfl i+\lfl \frac{b}{c}\rfl+\frac{(a\bmod c)i+(b\bmod c)}{c}\rfl\\
	&=\lfl\frac{a}{c}\rfl\frac{n(n+1)}{2}+\lfl\frac{b}{c}\rfl(n+1)+f(n,a\bmod c,b\bmod c,c)
\end{aligned}
$$

于是可以递归求解。考虑 $a<c,\ b<c$ 的情况即可。

$$
\newcommand\lfl{\left\lfloor}
\newcommand\rfl{\right\rfloor}
\begin{aligned}
	f(n,a,b,c)&=\sum_{i=0}^n\sum_{j=0}^{\lfl(ai+b)/c\rfl-1}1\\
	&=\sum_{j=0}^{\lfl(an+b)/c\rfl-1}\sum_{i=0}^n\left[j<\lfl\frac{ai+b}{c}\rfl\right]
\end{aligned}
$$

然后转化一下限制条件：

$$
\newcommand\lfl{\left\lfloor}
\newcommand\rfl{\right\rfloor}
\begin{aligned}
	j<\lfl\frac{ai+b}{c}\rfl&\Leftrightarrow j+1\le\lfl\frac{ai+b}{c}\rfl\\
	&\Leftrightarrow jc+c\le ai+b\\
	&\Leftrightarrow jc+c-b-1<ai\\
	&\Leftrightarrow i>\lfl\frac{jc+c-b-1}{a}\rfl
\end{aligned}
$$

令 $m=\left\lfloor\dfrac{an+b}{c}\right\rfloor$ 于是原式就可以化为：

$$
\newcommand\lfl{\left\lfloor}
\newcommand\rfl{\right\rfloor}
\begin{aligned}
	f(n,a,b,c)&=\sum_{j=0}^{m-1}\left(n-\lfl\frac{jc+c-b-1}{a}\rfl\right)\\
	&=nm-f(m-1,c,c-b-1,a)
\end{aligned}
$$

递归求解即可。递归的终止条件是 $f(n,0,b,c)=(n+1)\left\lfloor\dfrac{b}{c}\right\rfloor$。可以发现，这个递归的形式和欧几里得辗转相除法很相似，这就是它为什么被称为“类”欧几里得算法。因为每一次递归 $a,c$ 都会取模再交换，所以该算法时间复杂度是 $O(\log n)$。

代码实现非常简洁：

```cpp
typedef long long LL;
LL floorsum(LL n,LL a,LL b,LL c)
{
	LL ac=a/c,bc=b/c,m=(a*n+b)/c;
	if(a==0)
		return (n+1)*bc;
	if(a>=c || b>=c)
		return ac*(n*(n+1)/2)+bc*(n+1)+floorsum(n,a%c,b%c,c);
	else
		return n*m-floorsum(m-1,c,c-b-1,a);
}
```

### 万能欧几里得

咕。

### 二次剩余（Cipolla 算法）

对于 $a$，若存在 $x^2\equiv a\pmod p$，则 $a$ 是模 $p$ 意义下的二次剩余，反之则称 $a$ 是模 $p$ 意义下的非二次剩余。Cipolla 算法可以对于奇素数 $p$ 和 $a$，求上述方程的解。

:::lemma[引理 1]

对于 $a,p$ 定义勒让德符号：

$$
\left(a\over p\right)=\begin{cases}
1 &,a\text{ 是模 }p\text{ 意义的二次剩余}\\
-1 &,a\text{ 是模 }p\text{ 意义的非二次剩余}\\
0 &,a\equiv 0\pmod p
\end{cases}
$$

则对于奇素数 $p$，有欧拉判别准则：

$$
\left(a\over p\right)\equiv a^{\frac{p-1}{2}}\pmod p
$$

:::

:::proof

$a=0$ 时结论显然成立。否则，取 $p$ 的一个原根 $g$。

若 $a$ 是二次剩余：则有 $a=g^{2k}\ (k\in\mathbb{N})$，于是 $a^{\frac{p-1}{2}}=g^{k(p-1)}=(g^{p-1})^k\equiv 1\pmod p$ 。

若 $a$ 是非二次剩余：则有 $a=g^{2k+1}\ (k\in\mathbb{N})$，于是 $a^{\frac{p-1}{2}}=g^{k(p-1)+\frac{p-1}{2}}=g^{\frac{p-1}{2}}\equiv -1\pmod p$。

于是结论证毕。

:::

#### 算法流程

我们要解方程 $x^2\equiv a\pmod p$。

找到一个 $b$ 使得 $b^2-a$ 是非二次剩余。因为在模奇素数意义下二次剩余和非二次剩余数量相等（根据原根相关理论显然），所以随机选择 $b$ 期望可以 $2$ 次找到。

设 $i$ 为一个虚数单位满足 $i^2=b^2-a$，那么 $x=(b+i)^{\frac{p+1}{2}}\pmod p$ 则为原方程的解。

证明分两步：

1. 证明 $x^2\equiv a\pmod p$：

   $$
   \begin{aligned}
   x^2&\equiv (b+i)^{p+1} \\
   &\equiv (b+i)\cdot(b+i)^p \\
   &\equiv (b+i)\sum_{k=0}^p \binom{p}{k}b^k i^{p-k} \\
   &\equiv (b+i)\cdot (b^p+i^p) \\
   \end{aligned}
   $$

   然后因为 $b^p\equiv b^{p-1}\cdot b\equiv b,\ i^p\equiv i^{p-1}\cdot i\equiv (b^2-n)^{\frac{p-1}{2}}\cdot i\equiv-i$，有：

   $$
   x^2\equiv (b+i)(b-i)\equiv b^2-i^2\equiv b^2-(b^2-a)\equiv a
   $$

2. 证明 $x$ 的虚部为 $0$：

   反证法，若存在 $(u+vi)^2\equiv n\ (v\neq 0)$，即 $u^2+v^2(b^2-a)+2uvi\equiv n$。

   对比左右虚部可得 $2uv\equiv 0$，根据假设可得 $u\equiv 0$。

   那么 $v^2(b^2-a)\equiv n,\ b^2-a\equiv \dfrac{n}{b^2}$。因为 $n$ 是二次剩余，所以 $\dfrac{n}{b^2}$ 也是二次剩余，这与 $b^2-a$ 是非二次剩余矛盾。

至此，我们证明了 Cipolla 算法的正确性。该算法复杂度显然是 $O(\log p)$ 的。

## Part 2：线性代数

### 向量与矩阵

#### 基础定义

一个 $n$ 行 $m$ 列的数表被称作 $n\times m$ 的矩阵，记作 $A=[a_{i,j}]$

特别地，当 $n=m$ 时，称作 $n$ 阶方阵。

一个 $1\times n$ 矩阵被称为行向量，类似地，一个 $n\times 1$ 的矩阵被称作列向量。

---

#### 矩阵加、减、数乘

设 $A=[a_{i,j}],B=[b_{i,j}],C=[c_{i,j}]$。

矩阵加/减的结果是每个元素相加/减，即 $C=A+B\Leftrightarrow c_{i,j}=a_{i,j}+b_{i,j}$。

矩阵数乘结果是每个元素乘上该标量，即 $C=\lambda A\Leftrightarrow c_{i,j}=\lambda a_{i,j}$

显然，矩阵加减满足交换律。

---

#### 矩阵乘法

设 $A=[a_{i,j}],B=[b_{i,j}],C=[c_{i,j}]$，则有 $\displaystyle C=A\times B\Leftrightarrow c_{i,j}=\sum_{k}a_{i,k}\cdot b_{k,j}$。

当 $A$ 列数等于 $B$ 行数时才能相乘，得到的结果有 $A$ 的行数与 $B$ 的列数。

主对角线为 $1$，其余元素为 $0$ 的 $n$ 阶方阵称为 $n$ 阶单位矩阵，记作 $I_n$。可以发现单位矩阵就是矩阵的幺元。

矩阵乘法**不满足交换律，满足结合律，满足分配律**。

---

#### 矩阵转置

矩阵行列交换。记作 $A^T$。矩阵转置后行列式不变。

### 高斯消元

#### 矩阵初等变换

- 交换两行；
- 一行乘上某个数；
- 一行加上另一行的 $k$ 倍。

---

#### 高斯消元

通过矩阵初等变换将矩阵变为上三角形式：$\displaystyle\begin{bmatrix}1&\square&\cdots&\square\\0&1&\cdots&\square\\\vdots&\vdots&\ddots&\vdots\\0&0&\cdots&1\end{bmatrix}$。

方法：按顺序选取主元。处理第 $i$ 个主元时，从 $[i,n]$ 行中选取第 $j$ 列不为 $0$ 的行交换到第 $i$ 行。然后消去 $(i,n]$ 行中的第 $i$ 个主元。然后把每一行的主元系数化为 $1$。最后形式如上所示。

---

#### 高斯-约旦消元

类似于高斯消元，但是消元时会将 $[1,n]\backslash\{i\}$ 行的主元都消去，最后直接变为对角矩阵。

---

#### 解线性方程组

线性方程组指的是有 $n$ 个未知数，若干方程，每个方程都是关于未知数和常数的齐次式。

所以线性方程组可以表示为 $A\times\boldsymbol{x}=\boldsymbol{c}$，其中 $\boldsymbol{x}$ 为表示未知数的向量，$\boldsymbol{c}$ 为表示常数的向量。

将 $\boldsymbol{c}$ 拼接在 $A$ 后，构造出一个**增广矩阵**，发现对增广矩阵进行初等变换即为加减消元的过程。

所以可以高斯消元后对上三角矩阵回带，或者高斯-约旦消元一步到位。

### 线性空间

#### 线性空间

:::definition[线性空间]
在集合 $V$ 上定义数乘、加法，使得加法满足交换律，数乘满足分配律，称 $V$ 为**线性空间**。称 $V$ 中元素为**向量**。

:::

---

#### 线性生成与基

取 $S\subseteq V$，取其中有限个向量 $\boldsymbol{a}_1,\boldsymbol{a}_2,\dots,\boldsymbol{a}_n$ 和标量 $k_1,k_2,\dots,k_n$，则称 $\sum k_i\boldsymbol{a}_i$ 为 $S$ 的一个**线性表示**。

如果这组向量中任意一个向量不能被其它向量表示，称这组向量**线性无关**，否则称这组向量**线性相关**。

$S$ 的所有线性表示组成的集合称为 $S$ 的**线性生成**，记作 $\operatorname{span}S$，如果 $\boldsymbol{b}\in\operatorname{span}S$，则称 $\boldsymbol{b}$ 能被 $S$ 线性表示。

如果一个线性无关向量组能够生成 $V$，称这组向量为 $V$ 的一组**基**。$V$ 的所有基大小均相同，这个大小被称为 $V$ 的**维数**，记作 $\operatorname{dim}V$。

对于 $V$ 的一组基 $\varepsilon_1,\varepsilon_2,\dots\varepsilon_n$，$\boldsymbol{v}\in V$ 能被唯一表示为 $\sum k_i\varepsilon_i$，称**列**向量 $[k_1,k_2,\dots,k_n]^T$ 为 $\boldsymbol{v}$ 的**坐标**。

---

#### 如何求基

给定向量组 $S$，求 $\operatorname{span} S$ 的一组基，可以使用高斯消元。

枚举每一个主元，选定一个向量，消去其它向量中的这个主元。最后得到的非零向量就是一组基。

特别地，每个整数可以看做每一个元都是 $\mathbb{F}_2$ 上的元素的向量，求出来的基被称作**线性基**，可以用于解决异或相关问题。

---

#### 线性映射

两个线性空间 $V,W$ 上的一个映射 $T:V\to W$ 是**线性映射**当且仅当满足 $T(k\boldsymbol{a}+\boldsymbol{b})=T(k\boldsymbol{a})+T(\boldsymbol{b})$。特别地，当 $V=W$ 时 $T$ 称作 $V$ 上的**线性变换**。

矩阵可以用来描述线性映射/变换。取 $V$ 中一组基 $\beta_1,\beta_2,\dots,\beta_n$，$W$ 中一组基 $\gamma_1,\gamma_2,\dots,\gamma_m$，如果有 $T(\beta_j)=\sum a_{i,j}\gamma_i$，则称矩阵 $[a_{i,j}]$ 为 $T$ 在基 $\beta,\gamma$ 下的**矩阵**，记作 $[T]_\beta^\gamma$。特别地，若 $\beta=\gamma$，则可以记作 $[T]_\beta$。可以理解为，$[T]_\beta^\gamma$ 是把 $T(\beta_j)$ 的坐标放在第 $j$ 列组成的矩阵。

那么可以得到线性映射 $T(\boldsymbol{v})=[T]_\beta^\gamma\boldsymbol{v}$，线性映射复合 $[ST]_\beta^\gamma=[S]_\beta^\gamma[T]_\beta^\gamma$。

---

#### 秩

向量组 $S$ 的秩定义为 $\operatorname{dim}\operatorname{span}S$，记作 $\operatorname{rank}S$；线性变换 $T$ 的秩定义为其矩阵的秩，记作 $\operatorname{rank}T$；矩阵 $A$ 的秩定义为其列向量组的秩，记作 $\operatorname{rank}A$。

因为矩阵初等变换不会改变秩，所以可以用高斯消元求秩。高斯消元后非零行向量数就是秩。

### 行列式

#### 行列式

对于一个 $n$ 阶方阵 $A=[a_{i,j}]$，定义其行列式为 $\displaystyle\sum_{p_1,p_2,\dots,p_n}(-1)^{\tau(p)}\prod_{i=1}^n a_{i,p_i}$，记作 $\det(A)$ 或 $|A|$。

行列式的几何意义为列向量/行向量围出的有向体积，或者说经过线性变换后有向体积变化倍率。

由此可以得到行列式的一些性质：$\det(I_n)=1$；两行/列交换，行列式取反；某行/列乘上一个数，行列式也乘上这个数；一行/列加上另一行/列的 $k$ 倍，行列式不变。

所以可以用高斯消元求行列式，在进行初等变换时记录行列式的改变即可。

## Part 3：多项式与生成函数
