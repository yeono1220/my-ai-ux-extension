from sympy import *
import matplotlib.pyplot as plt
import numpy as np

# 문제 조건 세팅 [cite: 66]
A = Matrix([[1, 1], [-4, 1]])
t = Symbol('t', real=True)
x0 = Matrix([0, 1])

print("=== [ Q1 ] 실행 결과 ===")

# [조건 1] Matrix Exponential 이용한 풀이 
sol = simplify(exp(A*t)*x0)
print("\n1. Matrix Exponential Solution (sol):")
print(sol)

# [조건 2] Laplace Transform 이용한 풀이 [cite: 38, 44]
s = symbols('s', positive=True)
X = (s*eye(2) - A)**(-1) * x0
Lsol = inverse_laplace_transform(X, s, t)
print("\n2. Laplace Transform Solution (Lsol):")
print(Lsol)

# [조건 3] Parametric Curve Plot [cite: 39, 52]
dt = np.linspace(0, 5, 500)  # [cite: 53]
x = lambdify(t, sol[0], 'numpy')  # [cite: 54]
y = lambdify(t, sol[1], 'numpy')  # [cite: 54]

plt.figure(figsize=(3, 3))  # [cite: 55]
plt.plot(x(dt), y(dt))  # [cite: 55]
plt.plot(x0[0], x0[1], 'ro') # 초기 위치 마킹 
plt.xlabel('x(t)')
plt.ylabel('y(t)')
plt.title('Q1 Parametric Curve')
plt.grid(True, linestyle='--', alpha=0.5)
plt.show()  # [cite: 55]