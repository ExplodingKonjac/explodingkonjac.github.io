---
title: 最新最热多项式复合逆
description: 从 Bostan–Mori 算法与拉格朗日反演出发，介绍形式幂级数幂的系数枚举，以及多项式复合逆和复合函数的快速算法。
pubDate: 2024-03-21
tags: [algorithms, polynomials, formal-power-series]
draft: false
---

## 声明

:::note[来源说明]
本文大部分译自参考文献 [1]，还有一些自己的理解和补充。

:::

## 问题引入

对于一个特征值足够大的域 $\mathbb{K}$，定义 $\mathbb{K}[\![x]\!]$ 表示以 $\mathbb{K}$ 中元素为系数的形式幂级数。

那么，对于给定的多项式 $f(x)$ 以及 $n,k$，我们希望求出：

$$
[x^k]f(x)^0,\ [x^k]f(x)^1,\dots,[x^k]f(x)^{n-1}
$$

设次数为 $n$ 的多项式乘法复杂度为 $M(n)$，那么本文可以给出该问题的一个 $O(M(n+k)\log(n+k))$ 的解法。

## Bostan-Mori 算法

该算法提出于参考文献 [2]。

对于给定的 $n$ 次多项式 $f(x),g(x)$ 以及 $k$，Bostan-Mori 算法能够求出：

$$
[x^k]\frac{f(x)}{g(x)}
$$

复杂度为 $O(M(n)\log k)$。

:::lemma[引理 1]
$f(x)f(-x)$ 可以表示为 $H(x^2)$，即只包含偶数项。

:::

:::proof
提取 $f(x)$ 的奇偶次项，写成 $f(x)=c_0(x^2)+xc_1(x^2)$，那么 $f(x)f(-x)=c_0(x^2)^2-x^2c_1(x^2)^2$。

:::

将式子进行重写：

$$
\frac{f(x)}{g(x)}=\frac{f(x)g(-x)}{g(x)g(-x)}=\frac{xP(x^2)+Q(x^2)}{H(x^2)}
$$

其中，$H(x^2)$ 是将 $g(x)g(-x)$ 重写，而 $P(x^2),Q(x^2)$ 分别是提取 $f(x)g(-x)$ 的奇数项和偶数项。

那么：

$$
[x^k]\frac{f(x)}{g(x)}=\begin{cases}
\displaystyle [x^{\lfloor k/2\rfloor}]\frac{P(x)}{H(x)} &,2\mid k \\
\displaystyle [x^{\lfloor k/2\rfloor}]\frac{Q(x)}{H(x)} &,2\nmid k
\end{cases}
$$

可以递归到规模减半的子问题，递归边界为 $k=0$，是平凡的。

注意 $P(x),Q(x),H(x)$ 的次数仍然是 $n$，所以该算法时间复杂度为 $O(M(n)\log k)$。

## 原问题的算法

我们假设 $[x^0]f(x)=0$，否则，我们可以让 $f(x)$ 减去常数项求解，最后多一次卷积。

记 $ans_i=[x^k]f(x)^i$，那么我们有：

$$
ans_i=[x^ky^i]\sum_jy^jf(x)^j=[x^ky^i]\frac{1}{1-yf(x)}
$$

于是我们只需要求出 $[x^k]\dfrac{1}{1-yf(x)}$，结果是 $\mathbb{K}[\![y]\!]$ 中的元素。

我们应用 Bostan-Mori 算法。观察算法过程：每进行一次迭代，$y$ 的次数就会翻倍；由于我们可以把分子分母对 $x^{k+1}$ 取模，而 $k$ 减半，从而 $x$ 的次数也会减半。因此 $x,y$ 的次数之积是 $O(n+k)$ 的，可以在 $O(M(n+k))$ 的时间复杂度内计算二元多项式的乘法。

整个算法的复杂度是 $O(M(n+k)\log (n+k))$。

在算法竞赛中，$\mathbb{K}$ 通常为 NTT 模数域，此时时间复杂度为 $O((n+k)\log^2(n+k))$。

## 求解多项式复合逆

原文题有另外的一个解法，来自参考文献 [3]。其中用到了复合逆。我们可以通过一种“算两次”的方法反解出复合逆。下面介绍这种方法：

我们仍然要求 $[x^k]\dfrac{1}{1-yf(x)}$。但是这次我们设 $H(x)=\dfrac{1}{1-yx}$ 然后使用拉格朗日反演，设 $g(x)$ 为 $f(x)$ 的复合逆，那么：

$$
\begin{aligned}%
[x^k] \dfrac{1}{1-yf(x)}&=\dfrac{1}{k}[x^{k-1}]H'(x)\left(\dfrac{x}{g(x)}\right)^k \\
&=\dfrac{1}{k}[x^{k-1}]\dfrac{y}{(1-yx)^2}\left(\dfrac{x}{g(x)}\right)^k
\end{aligned}
$$

我们有 $\displaystyle \frac{1}{(1-x)^2}=\sum_{i=0}^{+\infty} ix^{i+1}$，带入得到：

$$
[x^k]\frac{1}{1-yf(x)}=\frac{1}{k}[x^{k-1}]y\sum_{i=0}^k (i+1)x^iy^i\left(\dfrac{x}{g(x)}\right)^k
$$

然后取 $y^i$ 系数得到：

$$
\begin{aligned}
ans_i&=[x^ky^i]\frac{1}{1-yf(x)} \\
&=\frac{i}{k}[x^{k-i}]\left(\dfrac{x}{g(x)}\right)^k
\end{aligned}
$$

于是我们只需要求出 $(x/g(x))^k\bmod x^{k+1}$ 就可以得到所有 $ans_i$。

反之亦然，我们可以通过本文的方法得到 $ans_i$，并逆推出 $(x/g(x))^k\bmod x^{k+1}$，然后再进行开 $k$ 次根、求逆的操作，就可以得到 $g(x)$。

至此，我们完成了对多项式复合逆的求解。

## 求解多项式复合函数

根据参考文献 [4]，多项式复合函数可以与多项式复合逆在相同复杂度内计算。

下面讲解如何使用复合逆求解复合函数。

假设我们有多项式 $\displaystyle P(x)=\sum_{i=1}^{n-1} p_ix^i,\ Q(x)=\sum_{i=0}^{n-1}q_ix^i$，目标是求出 $R(x)=Q(P(x))\bmod x^n$。

首先我们可以假设 $p_1=1,\ q_0=0$，否则假设有 $k<n$ 满足 $p_1=p_2=\dots=p_{k-1}=0,\ p_k\neq 0$，那么：

$$
\begin{aligned}
& \tilde{P}(x):=\sqrt[k]{\frac{P(x)}{p_k}} \\
& \tilde{Q}(x):=Q(p_kx^k)-q_0 \\
& R(x)=\tilde{Q}(\tilde{P}(x))+q_0
\end{aligned}
$$

就可以转化成 $p_1=1,\ q_0=0$ 的情形。

记 $P^{(-1)}(x)$ 表示 $P(x)$ 的复合逆，然后我们写出一些定义：

$$
\begin{aligned}
& V(x):=P^{(-1)}(x) \bmod x^{2n} \\
& \bar{V}(x):=(V(x)-x^nQ(x)V'(x)) \bmod x^{2n} \\
& \bar{P}(x):=V^{(-1)}(x) \bmod x^{2n}
\end{aligned}
$$

:::lemma[引理 1]

$$
P(x)=\bar{P}(x)\pmod{x^{n+1}}
$$

:::

:::proof
设 $k\le n$，根据拉格朗日反演，我们有：

$$
\begin{aligned}%
[x^k]\bar{P}(x)&=\frac{1}{k}[x^{k-1}]\left(\frac{x}{V(x)-x^nQ(x)V'(x)}\right)^k \\
&=\frac{1}{k}[x^{k-1}]\left(\frac{V(x)}{x}-x^nQ(x)V'(X)\right)^{-n} \\
&=\frac{1}{k}[x^{k-1}]\sum_{i=0}^{+\infty}\binom{-n}{i}(-1)^ix^{ni}Q(x)^iV'(x)^i\left(\frac{V(x)}{x}\right)^{-n-i}
\end{aligned}
$$

当 $i\ge 1$ 时后面式子的次数 $\ge n$，而 $k-1<n$，所以只用考虑 $i=0$ 的项。那么：

$$
\begin{aligned}%
[x^k]\bar{P}(x)&=\frac{1}{k}[x^{k-1}]\left(\frac{x}{V(x)}\right)^n \\
&=[x^k]P(x)
\end{aligned}
$$

所以 $P(x)=\bar{P}(x)\pmod{x^{n+1}}$。

:::

:::lemma[引理 2]

$$
P(\bar{V}(x))=P(V(x))-x^nP'(V(x))Q(x)V'(x)\pmod{x^{2n}}
$$

:::

:::proof
直接将 $P(\bar{V}(x))$ 进行展开：

$$
\begin{aligned}
P(\bar{V}(x))&=\sum_{i=1}^{n-1} p_i\left(V(x)-x^nQ(x)V'(x)\right)^i \\
&=\sum_{i=1}^{n-1}p_i\sum_{j=0}^i\binom{i}{j}(-1)^jV(x)^{i-j}x^{nj}Q(x)^jV'(x)^j
\end{aligned}
$$

当 $j\ge 2$ 时后半部分 $\bmod x^{2n}=0$，所以只取 $j=0,1$：

$$
\begin{aligned}
P(\bar{V}(x))&=\sum_{i=1}^{n-1}p_iV(x)^i+\sum_{i=1}^{n-1}i p_i V(x)^{i-1}x^nQ(x)V'(x) \\
&=P(V(x))-x^nP'(V(x))Q(x)V'(x)
\end{aligned}
$$

于是引理 2 得证。

:::

因为 $P(V(x))=x$，所以有 $P'(V(x))=V'(x)P'(V(x))=1$。于是我们可以重写引理 2：

$$
P(\bar{V}(x))=x-x^nQ(x) \pmod{x^{2n}}
$$

然后我们将 $\bar{P}(x)$ 替换 $x$，得到：

$$
P(x)=\bar{P}(x)-\bar{P}(x)^nQ(\bar{P}(x))\pmod{x^{2n}}
$$

根据引理 1 有 $P(x)=\bar{P}(x)\pmod{x^{n+1}}$，而 $\bar{P}(x)^n$ 的最低次项是 $x^n$。因此 $\bar{P}(x),\ Q(\bar{P}(x))$ 中 $\ge n$ 次项在乘完后次数会 $\ge 2n$，因此可以对 $x^n$ 取模。于是这两个 $\bar{P}(x)$ 都可以替换为 $P(x)$：

$$
P(x)=\bar{P}(x)-P(x)^nQ(P(x))\pmod{x^{2n}}
$$

也即：

$$
x^nR(x)=\left(\frac{x}{P(x)}\right)^{n}(\bar{P}(x)-P(x))\pmod{x^{2n}}
$$

因此我们只需要计算出 $V(x),\bar{V}(x),\bar{P}(x)$ 便可以求出 $R(x)\bmod x^{2n}$，时间复杂度显然是和求复合逆等价的，为 $O(M(n)\log n)$。

## 参考文献

[1] noshi91. FPS の合成と逆関数、冪乗の係数列挙 $\Theta(n (\log(n))^2)$. <https://noshi91.hatenablog.com/entry/2024/03/16/224034>.

[2] A. Bostan & R. Mori (2021). A Simple and Fast Algorithm for Computing the $N$-th Term of a Linearly Recurrent Sequence. [arXiv 2008.08822](https://arxiv.org/abs/2008.08822) [cs.SC]

[3] zscoder. Generating Functions in Competitive Programming (Part 2). <https://codeforces.com/blog/entry/77551>.

[4] R. P. Brent and H. T. Kung (1978). Fast Algorithms for Manipulating Formal Power Series. J. ACM 25, 4 (Oct. 1978), 581–595.
